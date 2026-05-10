"""OpenTelemetry observability: traces, metrics, and structured logs with trace correlation.

Layout:
- `init_observability(...)` configures TracerProvider + MeterProvider + log correlation.
- `instrument_app(app)` enables FastAPI / HTTPX / asyncpg / SQLAlchemy auto-instrumentation.
- `JsonFormatter` emits one JSON line per request including `trace_id`/`span_id` from the active span.
- `ObservabilityMiddleware` is a thin ASGI wrapper that adds an `X-Request-ID` header and
  emits the structured request log line on completion. The actual HTTP server span comes
  from the FastAPI instrumentor; the middleware only adds human-readable summaries.

Counters/histograms exposed:
- `rate_limit_rejections_total{bucket}`  (custom)
- `llm_calls_total{model,status}`        (custom)
- `llm_tokens_total{model,kind}`         (custom)
- `http.server.request.duration` etc.   (auto, from FastAPI instrumentor)

Backend selection is environment-driven via `OTEL_EXPORTER_OTLP_ENDPOINT`. If unset, traces
are dropped and metrics are still scrapable from `/metrics` via the Prometheus reader.
"""
from __future__ import annotations

import json
import logging
import time
import urllib.parse
import uuid
from contextvars import ContextVar
from typing import Any

from fastapi import FastAPI
from opentelemetry import metrics, trace
from opentelemetry.exporter.otlp.proto.http.metric_exporter import OTLPMetricExporter
from opentelemetry.exporter.otlp.proto.http.trace_exporter import OTLPSpanExporter
from opentelemetry.exporter.prometheus import PrometheusMetricReader
from opentelemetry.instrumentation.asyncpg import AsyncPGInstrumentor
from opentelemetry.instrumentation.fastapi import FastAPIInstrumentor
from opentelemetry.instrumentation.httpx import HTTPXClientInstrumentor
from opentelemetry.instrumentation.sqlalchemy import SQLAlchemyInstrumentor
from opentelemetry.sdk.metrics import MeterProvider
from opentelemetry.sdk.metrics.export import PeriodicExportingMetricReader
from opentelemetry.sdk.resources import SERVICE_NAME, SERVICE_VERSION, Resource
from opentelemetry.sdk.trace import TracerProvider
from opentelemetry.sdk.trace.export import BatchSpanProcessor, ConsoleSpanExporter
from starlette.types import ASGIApp, Receive, Scope, Send

# ---------------------------------------------------------------------------
# Request-scoped context

request_id_var: ContextVar[str] = ContextVar("request_id", default="-")
user_id_var: ContextVar[str] = ContextVar("user_id", default="-")

# ---------------------------------------------------------------------------
# Lazily-resolved tracer and meter handles. They resolve to the global providers
# set up by `init_observability(...)`. If init was skipped (e.g. in unit tests),
# the API falls back to no-op instruments so callers stay safe.

tracer = trace.get_tracer("app")


def _meter() -> metrics.Meter:
    return metrics.get_meter("app")


# Module-level lazy counter holders so we resolve them after init_observability runs.
_counters: dict[str, metrics.Counter] = {}


def _counter(name: str, description: str, unit: str = "1") -> metrics.Counter:
    if name not in _counters:
        _counters[name] = _meter().create_counter(name, unit=unit, description=description)
    return _counters[name]


def record_rate_limit_rejection(bucket: str) -> None:
    _counter("rate_limit_rejections_total", "Requests rejected by the rate limiter.").add(
        1, {"bucket": bucket}
    )


def record_llm_call(model: str, status: str) -> None:
    _counter("llm_calls_total", "LLM API calls.").add(1, {"model": model, "status": status})


def record_llm_tokens(model: str, kind: str, count: int) -> None:
    if count <= 0:
        return
    _counter("llm_tokens_total", "LLM tokens consumed.").add(
        count, {"model": model, "kind": kind}
    )


# ---------------------------------------------------------------------------
# Initialization

def _parse_otlp_headers(raw: str) -> dict[str, str] | None:
    """Parse the OTel-spec OTEL_EXPORTER_OTLP_HEADERS format: comma-separated key=value
    pairs with URL-encoded values (so a literal space arrives as %20)."""
    if not raw:
        return None
    out: dict[str, str] = {}
    for pair in raw.split(","):
        if "=" not in pair:
            continue
        key, value = pair.split("=", 1)
        out[key.strip()] = urllib.parse.unquote(value.strip())
    return out or None


def init_observability(
    *,
    service_name: str,
    service_version: str,
    environment: str,
    otlp_endpoint: str | None,
    otlp_headers: str | None,
    metrics_enabled: bool,
    console_traces: bool,
) -> None:
    resource = Resource.create(
        {
            SERVICE_NAME: service_name,
            SERVICE_VERSION: service_version,
            "deployment.environment": environment,
        }
    )
    headers = _parse_otlp_headers(otlp_headers or "")

    # Tracer provider
    tracer_provider = TracerProvider(resource=resource)
    if otlp_endpoint:
        tracer_provider.add_span_processor(
            BatchSpanProcessor(
                OTLPSpanExporter(
                    endpoint=f"{otlp_endpoint.rstrip('/')}/v1/traces",
                    headers=headers,
                )
            )
        )
    if console_traces:
        tracer_provider.add_span_processor(BatchSpanProcessor(ConsoleSpanExporter()))
    trace.set_tracer_provider(tracer_provider)

    # Meter provider
    readers: list[Any] = []
    if metrics_enabled:
        readers.append(PrometheusMetricReader())
    if otlp_endpoint:
        readers.append(
            PeriodicExportingMetricReader(
                OTLPMetricExporter(
                    endpoint=f"{otlp_endpoint.rstrip('/')}/v1/metrics",
                    headers=headers,
                ),
                export_interval_millis=15_000,
            )
        )
    meter_provider = MeterProvider(resource=resource, metric_readers=readers)
    metrics.set_meter_provider(meter_provider)

    # Log correlation handled by TraceContextLogFilter at log time — see configure_logging.


def instrument_app(app: FastAPI) -> None:
    FastAPIInstrumentor.instrument_app(app, excluded_urls="/health,/metrics")
    HTTPXClientInstrumentor().instrument()
    AsyncPGInstrumentor().instrument()


def instrument_sqlalchemy_engine(engine: Any) -> None:
    """Call after the async engine is constructed. Accepts an AsyncEngine and traces its sync core."""
    sync_engine = getattr(engine, "sync_engine", engine)
    SQLAlchemyInstrumentor().instrument(engine=sync_engine)


# ---------------------------------------------------------------------------
# Structured logging

class TraceContextLogFilter(logging.Filter):
    """Stamp the active OTel trace_id/span_id onto every log record."""

    def filter(self, record: logging.LogRecord) -> bool:
        span = trace.get_current_span()
        ctx = span.get_span_context() if span else None
        if ctx and ctx.is_valid:
            record.trace_id = format(ctx.trace_id, "032x")
            record.span_id = format(ctx.span_id, "016x")
        return True


_RESERVED_LOG_KEYS = {
    "args", "asctime", "created", "exc_info", "exc_text", "filename",
    "funcName", "levelname", "levelno", "lineno", "module", "msecs",
    "message", "msg", "name", "pathname", "process", "processName",
    "relativeCreated", "stack_info", "thread", "threadName", "taskName",
}


class JsonFormatter(logging.Formatter):
    def format(self, record: logging.LogRecord) -> str:
        payload: dict[str, Any] = {
            "ts": self.formatTime(record, "%Y-%m-%dT%H:%M:%S%z"),
            "level": record.levelname,
            "logger": record.name,
            "msg": record.getMessage(),
            "request_id": request_id_var.get(),
            "user_id": user_id_var.get(),
        }
        trace_id = getattr(record, "trace_id", None)
        span_id = getattr(record, "span_id", None)
        if trace_id:
            payload["trace_id"] = trace_id
        if span_id:
            payload["span_id"] = span_id

        if record.exc_info:
            payload["exc"] = self.formatException(record.exc_info)
        for key, value in record.__dict__.items():
            if key in _RESERVED_LOG_KEYS or key.startswith("_"):
                continue
            try:
                json.dumps(value)
                payload[key] = value
            except TypeError:
                payload[key] = repr(value)
        return json.dumps(payload, ensure_ascii=False)


_request_logger = logging.getLogger("app.request")


def _route_path(scope: Scope) -> str:
    route = scope.get("route")
    return getattr(route, "path", None) or "unmatched"


class ObservabilityMiddleware:
    """ASGI middleware: assigns request IDs, sets contextvars, emits a JSON request log.

    HTTP-level metrics and the server span come from the FastAPI instrumentor.
    """

    def __init__(self, app: ASGIApp) -> None:
        self.app = app

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        incoming = next(
            (v for k, v in scope.get("headers", []) if k == b"x-request-id"),
            None,
        )
        request_id = incoming.decode("latin-1") if incoming else uuid.uuid4().hex
        rid_token = request_id_var.set(request_id)
        uid_token = user_id_var.set("-")

        start = time.perf_counter()
        status_holder = {"code": 500}

        async def send_wrapper(message: dict[str, Any]) -> None:
            if message["type"] == "http.response.start":
                status_holder["code"] = message["status"]
                headers = list(message.get("headers", []))
                headers.append((b"x-request-id", request_id.encode("latin-1")))
                message = {**message, "headers": headers}
            await send(message)

        failed = False
        try:
            await self.app(scope, receive, send_wrapper)
        except Exception:
            failed = True
            raise
        finally:
            duration = time.perf_counter() - start
            extra = {
                "method": scope.get("method", "UNKNOWN"),
                "path": _route_path(scope),
                "raw_path": scope.get("path"),
                "status": status_holder["code"],
                "duration_ms": round(duration * 1000, 2),
            }
            if failed:
                _request_logger.exception("request failed", extra=extra)
            else:
                _request_logger.info("request", extra=extra)
            request_id_var.reset(rid_token)
            user_id_var.reset(uid_token)
