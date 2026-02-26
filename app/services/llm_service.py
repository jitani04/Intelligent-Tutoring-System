from collections.abc import AsyncIterator
from dataclasses import dataclass
from typing import Any, Literal

from openai import AsyncOpenAI


@dataclass(slots=True)
class LLMStreamEvent:
    type: Literal["token", "completed"]
    delta: str | None = None
    usage: dict[str, Any] | None = None


class LLMService:
    def __init__(self, *, api_key: str, model: str, timeout_seconds: float) -> None:
        self._model = model
        self._client = AsyncOpenAI(api_key=api_key, timeout=timeout_seconds)

    async def stream_response(self, *, input_messages: list[dict[str, Any]]) -> AsyncIterator[LLMStreamEvent]:
        async with self._client.responses.stream(model=self._model, input=input_messages) as stream:
            async for event in stream:
                if event.type == "response.output_text.delta" and getattr(event, "delta", None):
                    yield LLMStreamEvent(type="token", delta=event.delta)

            final_response = await stream.get_final_response()
            usage = getattr(final_response, "usage", None)
            usage_dict = usage.model_dump() if usage is not None and hasattr(usage, "model_dump") else None
            yield LLMStreamEvent(type="completed", usage=usage_dict)
