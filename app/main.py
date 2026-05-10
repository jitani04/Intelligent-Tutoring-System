from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from prometheus_client import make_asgi_app

from app.api.routes.artifacts import router as artifacts_router
from app.api.routes.auth import router as auth_router
from app.api.routes.chat import router as chat_router
from app.api.routes.conversations import router as conversations_router
from app.api.routes.materials import router as materials_router
from app.api.routes.projects import router as projects_router
from app.api.routes.quiz import router as quiz_router
from app.api.routes.flashcards import router as flashcards_router
from app.api.routes.search import router as search_router
from app.api.routes.stt import router as stt_router
from app.api.routes.tts import router as tts_router
from app.core.config import get_settings
from app.core.logging import configure_logging
from app.core.observability import (
    ObservabilityMiddleware,
    init_observability,
    instrument_app,
    instrument_sqlalchemy_engine,
)
from app.db.session import get_engine

settings = get_settings()

init_observability(
    service_name=settings.app_name,
    service_version=settings.app_version,
    environment=settings.environment,
    otlp_endpoint=settings.otel_otlp_endpoint or None,
    otlp_headers=settings.otel_otlp_headers or None,
    metrics_enabled=settings.metrics_enabled,
    console_traces=settings.otel_console_traces,
)
configure_logging(settings.log_level, json_logs=settings.json_logs)

app = FastAPI(title=settings.app_name)
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_allow_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
app.add_middleware(ObservabilityMiddleware)

instrument_app(app)
instrument_sqlalchemy_engine(get_engine())

if settings.metrics_enabled:
    app.mount("/metrics", make_asgi_app())

app.include_router(auth_router)
app.include_router(conversations_router)
app.include_router(chat_router)
app.include_router(materials_router)
app.include_router(projects_router)
app.include_router(quiz_router)
app.include_router(artifacts_router)
app.include_router(flashcards_router)
app.include_router(search_router)
app.include_router(stt_router)
app.include_router(tts_router)


@app.get("/health", tags=["health"])
async def health() -> dict[str, str]:
    return {"status": "ok"}
