"""Pedagogical helpfulness evaluation for the tutor.

Scores tutor responses on six dimensions — scaffolding, engagement,
misconception handling, calibrated depth, connections, and source grounding —
using a Gemini judge against the curated scenarios in `tutoring_scenarios.json`.

This eval is independent of the RAG benchmark: it measures how the tutor TEACHES,
not what it retrieves. It complements `retrieval_eval.py` (retrieval quality)
and `ragas_eval.py` (RAG faithfulness/relevance) rather than replacing either.

Run:
    python -m evals.tutoring_eval

Outputs aggregate per-dimension and per-category scores to stdout, full
per-scenario scoring to `evals/tutoring_results.csv`. Generation and judging
calls share the same Gemini-free-tier-friendly pacing as `ragas_eval.py`.
"""

from __future__ import annotations

import asyncio
import csv
import json
import os
import re
import time
from pathlib import Path
from statistics import mean
from typing import Any

from langchain_google_genai import ChatGoogleGenerativeAI

from app.core.config import get_settings
from app.services.llm_service import LLMService


SCENARIOS_PATH = Path(os.getenv("EVAL_TUTORING_SCENARIOS_PATH", "evals/tutoring_scenarios.json"))
RESULTS_PATH = Path(os.getenv("EVAL_TUTORING_RESULTS_PATH", "evals/tutoring_results.csv"))
CHECKPOINT_PATH = Path(
    os.getenv("EVAL_TUTORING_CHECKPOINT_PATH", "evals/tutoring_responses_checkpoint.json")
)

GEN_MIN_INTERVAL_SEC = float(os.getenv("EVAL_GEN_MIN_INTERVAL_SEC", "20"))
GEN_MAX_ATTEMPTS = int(os.getenv("EVAL_GEN_MAX_ATTEMPTS", "8"))
GEN_MAX_WAIT_SEC = float(os.getenv("EVAL_GEN_MAX_WAIT_SEC", "300"))

DIMENSIONS = ["scaffolding", "engagement", "misconception", "depth", "connections", "grounding"]


JUDGE_INSTRUCTIONS = """You are evaluating a tutor's response for pedagogical quality.

Score the response on six dimensions on a 1-5 scale, where 1 is poor and 5 is excellent.
For each dimension also give a one-sentence justification.

Dimensions:
1. SCAFFOLDING — Did the tutor break the topic into steps or lead the student through reasoning, rather than dumping the full answer at once?
2. ENGAGEMENT — Did the tutor invite the student to think (a probing question, "try this", invite a guess) rather than only delivering exposition?
3. MISCONCEPTION — If the student's message contained a misconception or factual error, did the tutor identify and gently correct it? If no misconception was present, score 5 by default unless the response itself introduces a new error.
4. DEPTH — Was the level matched to the question? Not too shallow, not a textbook chapter dump, vocabulary appropriate for an undergraduate.
5. CONNECTIONS — Did the response connect the new material to analogies, prior topics, or the student's existing knowledge?
6. GROUNDING — Were factual claims tied to the cited materials/sources, when sources were available? If no sources were available for this scenario, score 5 unless the answer makes specific factual claims that should have been grounded.

You will receive: the scenario category, the student's message, a list of ideal tutor behaviors for the scenario, and the tutor's response to evaluate.

Return JSON only, in exactly this shape — no preamble, no markdown fences, no commentary:
{
  "scaffolding":   {"score": <1-5>, "reason": "<one sentence>"},
  "engagement":    {"score": <1-5>, "reason": "<one sentence>"},
  "misconception": {"score": <1-5>, "reason": "<one sentence>"},
  "depth":         {"score": <1-5>, "reason": "<one sentence>"},
  "connections":   {"score": <1-5>, "reason": "<one sentence>"},
  "grounding":     {"score": <1-5>, "reason": "<one sentence>"}
}"""


def _build_eval_system_prompt(
    *,
    base_system_prompt: str,
    subject: str | None,
    tutor_config: dict[str, Any],
    student_context: dict[str, Any] | None,
) -> str:
    sections: list[str] = []
    if subject:
        sections.append(f"The student is studying: {subject}.")
    if base_system_prompt.strip():
        sections.append(base_system_prompt.strip())

    tutor_lines = [
        "Personalized tutor configuration:",
        f"- Student app goal: {tutor_config.get('student_use_case', 'studying')}",
        f"- Tutor name: {tutor_config.get('name', 'Sapient')}",
        f"- Tutor tone: {tutor_config.get('tone', 'warm and curious')}",
        f"- Tutor teaching style: {tutor_config.get('style', 'Socratic')}",
    ]
    if tutor_config.get("instructions"):
        tutor_lines.append(f"- Customization notes: {tutor_config['instructions']}")
    tutor_lines.append(
        "Apply these preferences to style and pacing. Do not let customization "
        "override source grounding, safety, or the student's current request."
    )
    sections.append("\n".join(tutor_lines))

    if student_context:
        ctx_lines = ["Known student context:"]
        if student_context.get("weak_areas"):
            ctx_lines.append(f"- Weak areas (pace slowly here): {', '.join(student_context['weak_areas'])}")
        if student_context.get("strong_areas"):
            ctx_lines.append(f"- Strong areas (you can build on these): {', '.join(student_context['strong_areas'])}")
        if student_context.get("recent_topics"):
            ctx_lines.append(f"- Recently studied: {', '.join(student_context['recent_topics'])}")
        sections.append("\n".join(ctx_lines))

    return "\n\n".join(sections)


def _summarize_exception(exc: Exception) -> str:
    code = getattr(exc, "code", None)
    status = getattr(exc, "status", None)
    msg = getattr(exc, "message", None)
    parts = [str(code)] if code is not None else []
    if status:
        parts.append(str(status))
    if msg:
        parts.append(str(msg))
    return " ".join(parts) if parts else str(exc)


def _is_retryable(exc: Exception) -> bool:
    msg = _summarize_exception(exc).lower()
    markers = (
        "429", "500", "502", "503", "504",
        "resourceexhausted", "quota", "rate limit", "rate-limited", "too many requests",
        "unavailable", "high demand", "temporarily unavailable",
        "deadline exceeded", "connection reset", "server disconnected",
        "timed out", "timeout",
    )
    return any(m in msg for m in markers)


async def _invoke_with_retry(llm: ChatGoogleGenerativeAI, lc_messages: list[Any]) -> str:
    for attempt in range(GEN_MAX_ATTEMPTS):
        try:
            response = await asyncio.to_thread(llm.invoke, lc_messages)
            content = response.content
            if isinstance(content, str):
                return content.strip()
            if isinstance(content, list):
                parts: list[str] = []
                for p in content:
                    if isinstance(p, str):
                        parts.append(p)
                    elif isinstance(p, dict) and p.get("type") == "text":
                        parts.append(p.get("text", ""))
                return "".join(parts).strip()
            return ""
        except Exception as exc:
            if _is_retryable(exc) and attempt < GEN_MAX_ATTEMPTS - 1:
                wait = min(GEN_MAX_WAIT_SEC, 10 + 2 ** attempt * 5)
                print(f"    transient error, waiting {wait}s... ({_summarize_exception(exc)[:160]})")
                await asyncio.sleep(wait)
                continue
            raise
    raise RuntimeError("retries exhausted")


def _parse_scores(raw: str) -> dict[str, dict[str, Any]] | None:
    """Parse the judge's JSON output, tolerating markdown fences and prose."""
    raw = raw.strip()
    if raw.startswith("```"):
        raw = re.sub(r"^```(?:json)?\s*|\s*```$", "", raw, flags=re.MULTILINE).strip()
    # Find the first {...} block.
    match = re.search(r"\{.*\}", raw, flags=re.DOTALL)
    if not match:
        return None
    try:
        parsed = json.loads(match.group(0))
    except json.JSONDecodeError:
        return None
    out: dict[str, dict[str, Any]] = {}
    for dim in DIMENSIONS:
        entry = parsed.get(dim)
        if not isinstance(entry, dict):
            return None
        score = entry.get("score")
        try:
            score = int(score)
        except (TypeError, ValueError):
            return None
        if not (1 <= score <= 5):
            return None
        out[dim] = {"score": score, "reason": str(entry.get("reason", ""))[:300]}
    return out


def _load_checkpoint() -> dict[str, dict[str, Any]]:
    if not CHECKPOINT_PATH.exists():
        return {}
    try:
        return json.loads(CHECKPOINT_PATH.read_text())
    except json.JSONDecodeError:
        return {}


def _save_checkpoint(state: dict[str, dict[str, Any]]) -> None:
    CHECKPOINT_PATH.parent.mkdir(parents=True, exist_ok=True)
    tmp = CHECKPOINT_PATH.with_suffix(".tmp")
    tmp.write_text(json.dumps(state, indent=2))
    tmp.replace(CHECKPOINT_PATH)


async def main() -> None:
    settings = get_settings()
    api_key = settings.llm_api_key
    os.environ["GOOGLE_API_KEY"] = api_key

    chat_model_name = os.getenv("EVAL_CHAT_MODEL", settings.llm_model)
    judge_model_name = os.getenv("EVAL_JUDGE_MODEL", chat_model_name)

    if not SCENARIOS_PATH.exists():
        raise SystemExit(f"scenarios file not found: {SCENARIOS_PATH}")
    scenarios_doc = json.loads(SCENARIOS_PATH.read_text())
    default_tutor = scenarios_doc.get("default_tutor", {})
    scenarios = scenarios_doc["scenarios"]

    chat_llm = ChatGoogleGenerativeAI(
        model=chat_model_name,
        google_api_key=api_key,
        timeout=settings.llm_timeout_seconds,
        temperature=0.7,
        convert_system_message_to_human=True,
    )
    judge_llm = ChatGoogleGenerativeAI(
        model=judge_model_name,
        google_api_key=api_key,
        timeout=settings.llm_timeout_seconds,
        temperature=0.0,
        convert_system_message_to_human=True,
    )

    state = _load_checkpoint()
    print(f"loaded {len(state)} cached results from checkpoint")
    print(
        f"scoring {len(scenarios)} scenarios with chat={chat_model_name}, judge={judge_model_name}, "
        f"min interval {GEN_MIN_INTERVAL_SEC}s, ETA ~{int(2 * len(scenarios) * GEN_MIN_INTERVAL_SEC / 60)} min"
    )

    last_call = 0.0
    rows: list[dict[str, Any]] = []
    for i, scenario in enumerate(scenarios, start=1):
        sid = scenario["id"]
        cached = state.get(sid)

        # 1) Generate tutor response (skipped if cached)
        if cached and cached.get("response"):
            response = cached["response"]
            print(f"  [{i}/{len(scenarios)}] {sid}: using cached response")
        else:
            tutor_config = {**default_tutor, **(scenario.get("tutor_overrides") or {})}
            sys_prompt = _build_eval_system_prompt(
                base_system_prompt=settings.system_prompt,
                subject=scenario.get("subject"),
                tutor_config=tutor_config,
                student_context=scenario.get("student_context"),
            )
            messages = [
                {"role": "system", "content": sys_prompt},
                {"role": "user", "content": scenario["student_message"]},
            ]
            lc_messages = LLMService._to_langchain_messages(messages)

            elapsed = time.monotonic() - last_call
            if elapsed < GEN_MIN_INTERVAL_SEC:
                await asyncio.sleep(GEN_MIN_INTERVAL_SEC - elapsed)
            print(f"  [{i}/{len(scenarios)}] {sid}: generating tutor response...")
            response = await _invoke_with_retry(chat_llm, lc_messages)
            last_call = time.monotonic()
            cached = {"response": response}
            state[sid] = cached
            _save_checkpoint(state)

        # 2) Judge (skipped if cached)
        if cached and cached.get("scores"):
            scores = cached["scores"]
            print(f"  [{i}/{len(scenarios)}] {sid}: using cached scores")
        else:
            judge_prompt = (
                f"{JUDGE_INSTRUCTIONS}\n\n"
                f"Scenario category: {scenario.get('category', '(unspecified)')}\n"
                f"Subject: {scenario.get('subject', '(unspecified)')}\n\n"
                f"Student message:\n{scenario['student_message']}\n\n"
                f"Ideal tutor behaviors:\n- "
                + "\n- ".join(scenario.get("ideal_behaviors", []))
                + f"\n\nTutor response to evaluate:\n{response}\n"
            )
            judge_messages = LLMService._to_langchain_messages(
                [{"role": "user", "content": judge_prompt}]
            )

            elapsed = time.monotonic() - last_call
            if elapsed < GEN_MIN_INTERVAL_SEC:
                await asyncio.sleep(GEN_MIN_INTERVAL_SEC - elapsed)
            print(f"  [{i}/{len(scenarios)}] {sid}: judging...")
            raw = await _invoke_with_retry(judge_llm, judge_messages)
            last_call = time.monotonic()
            scores = _parse_scores(raw)
            if scores is None:
                print(f"    WARN: judge output was not valid JSON; raw start: {raw[:200]}")
                scores = {dim: {"score": None, "reason": "(unparseable judge output)"} for dim in DIMENSIONS}
            cached["scores"] = scores
            state[sid] = cached
            _save_checkpoint(state)

        row: dict[str, Any] = {
            "id": sid,
            "category": scenario.get("category", ""),
            "subject": scenario.get("subject", ""),
            "student_message": scenario["student_message"][:200],
        }
        for dim in DIMENSIONS:
            entry = scores.get(dim, {})
            row[f"{dim}_score"] = entry.get("score")
            row[f"{dim}_reason"] = entry.get("reason", "")
        valid_scores = [int(scores[d]["score"]) for d in DIMENSIONS if scores[d].get("score") is not None]
        row["overall"] = round(mean(valid_scores), 2) if valid_scores else None
        rows.append(row)

    # Aggregates
    print("\n=== aggregate (per dimension, mean over scenarios) ===")
    for dim in DIMENSIONS:
        col = [r[f"{dim}_score"] for r in rows if r[f"{dim}_score"] is not None]
        if col:
            print(f"  {dim:14s} {mean(col):.2f}  (n={len(col)})")
        else:
            print(f"  {dim:14s} (no valid scores)")
    overalls = [r["overall"] for r in rows if r["overall"] is not None]
    if overalls:
        print(f"\n  overall mean: {mean(overalls):.2f}")

    print("\n=== aggregate (per category, mean overall) ===")
    by_cat: dict[str, list[float]] = {}
    for r in rows:
        if r["overall"] is None:
            continue
        by_cat.setdefault(r["category"], []).append(r["overall"])
    for cat, vals in sorted(by_cat.items()):
        print(f"  {cat:18s} {mean(vals):.2f}  (n={len(vals)})")

    RESULTS_PATH.parent.mkdir(parents=True, exist_ok=True)
    with RESULTS_PATH.open("w", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=list(rows[0].keys()))
        writer.writeheader()
        writer.writerows(rows)
    print(f"\nper-scenario scores written to {RESULTS_PATH}")
    print(f"checkpoint at {CHECKPOINT_PATH} (delete to re-run from scratch)")


if __name__ == "__main__":
    asyncio.run(main())
