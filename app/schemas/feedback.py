from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field

FeedbackRating = Literal["thumbs_up", "thumbs_down"]


class FeedbackCreate(BaseModel):
    message_id: int
    conversation_id: int
    rating: FeedbackRating
    feedback_text: str | None = Field(default=None, max_length=1000)
    correction: str | None = Field(default=None, max_length=1000)
    # Optional response-time metadata. Provided by the frontend when it still has
    # the trace from the original stream; absent on later re-rates / reloads.
    latency_ms: int | None = Field(default=None, ge=0)
    retrieved_chunk_ids: list[int] | None = None
    tool_trace: list[dict[str, Any]] | None = None


class FeedbackRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    user_id: int
    conversation_id: int
    message_id: int
    rating: str
    feedback_text: str | None
    correction: str | None
    llm_reason_category: str | None
    llm_feedback_summary: str | None
    llm_derived_preference: str | None
    task_type: str | None
    prompt_version: str | None
    model_name: str | None
    retrieved_chunk_ids: list[int] | None
    tool_trace: dict[str, Any] | list[dict[str, Any]] | None
    latency_ms: int | None
    created_at: datetime


class FeedbackAnalyticsRead(BaseModel):
    rating_counts: dict[str, int]
    reason_category_counts: dict[str, int]
    prompt_version_counts: dict[str, int]
    task_type_counts: dict[str, int]
    model_name_counts: dict[str, int]
    common_feedback_summaries: dict[str, int]
