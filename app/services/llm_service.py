from collections.abc import AsyncIterator
from dataclasses import dataclass
from typing import Any, Literal

from langchain_core.messages import AIMessage, BaseMessage, HumanMessage, SystemMessage
from langchain_google_genai import ChatGoogleGenerativeAI


@dataclass(slots=True)
class LLMStreamEvent:
    type: Literal["token", "completed"]
    delta: str | None = None
    usage: dict[str, Any] | None = None


class LLMService:
    def __init__(self, *, api_key: str, model: str, timeout_seconds: float) -> None:
        self._llm = ChatGoogleGenerativeAI(
            model=model,
            google_api_key=api_key,
            timeout=timeout_seconds,
            convert_system_message_to_human=True,
        )

    @staticmethod
    def _to_langchain_messages(input_messages: list[dict[str, Any]]) -> list[BaseMessage]:
        messages: list[BaseMessage] = []
        for message in input_messages:
            role = message["role"]
            content = message["content"]

            if role == "system":
                messages.append(SystemMessage(content=content))
            elif role == "user":
                messages.append(HumanMessage(content=content))
            elif role == "assistant":
                messages.append(AIMessage(content=content))
            else:
                raise ValueError(f"Unsupported message role: {role}")

        return messages

    async def stream_response(self, *, input_messages: list[dict[str, Any]]) -> AsyncIterator[LLMStreamEvent]:
        messages = self._to_langchain_messages(input_messages)
        usage_dict: dict[str, Any] | None = None
        async for chunk in self._llm.astream(messages):
            if isinstance(chunk.content, str) and chunk.content:
                yield LLMStreamEvent(type="token", delta=chunk.content)
            elif isinstance(chunk.content, list):
                for part in chunk.content:
                    if isinstance(part, str) and part:
                        yield LLMStreamEvent(type="token", delta=part)
                    elif isinstance(part, dict) and part.get("type") == "text" and part.get("text"):
                        yield LLMStreamEvent(type="token", delta=part["text"])

            chunk_usage = getattr(chunk, "usage_metadata", None)
            if chunk_usage is not None:
                usage_dict = dict(chunk_usage)

        yield LLMStreamEvent(type="completed", usage=usage_dict)
