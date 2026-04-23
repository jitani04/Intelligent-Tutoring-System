from collections.abc import AsyncIterator
from dataclasses import dataclass
from typing import Any, Literal

from langchain_core.messages import AIMessage, BaseMessage, HumanMessage, SystemMessage
from langchain_google_genai import ChatGoogleGenerativeAI


@dataclass(slots=True)
class LLMStreamEvent:
    type: Literal["token", "tool_call_ready", "completed"]
    delta: str | None = None
    tool_calls: list[dict[str, Any]] | None = None
    ai_message: Any | None = None  # accumulated AIMessageChunk, passed back for second-pass context
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
        for msg in input_messages:
            role = msg["role"]
            content = msg["content"]
            if role == "system":
                messages.append(SystemMessage(content=content))
            elif role == "user":
                messages.append(HumanMessage(content=content))
            elif role == "assistant":
                messages.append(AIMessage(content=content))
            else:
                raise ValueError(f"Unsupported message role: {role}")
        return messages

    def to_langchain_messages(self, input_messages: list[dict[str, Any]]) -> list[BaseMessage]:
        return self._to_langchain_messages(input_messages)

    async def _stream_lc(self, lc_messages: list[BaseMessage]) -> AsyncIterator[LLMStreamEvent]:
        usage_dict: dict[str, Any] | None = None
        async for chunk in self._llm.astream(lc_messages):
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

    async def stream_response(self, *, input_messages: list[dict[str, Any]]) -> AsyncIterator[LLMStreamEvent]:
        async for event in self._stream_lc(self._to_langchain_messages(input_messages)):
            yield event

    async def stream_lc(self, *, lc_messages: list[BaseMessage]) -> AsyncIterator[LLMStreamEvent]:
        async for event in self._stream_lc(lc_messages):
            yield event

    async def stream_with_tools(
        self,
        *,
        input_messages: list[dict[str, Any]],
        tools: list[dict[str, Any]],
    ) -> AsyncIterator[LLMStreamEvent]:
        lc_messages = self._to_langchain_messages(input_messages)
        llm_with_tools = self._llm.bind_tools(tools)

        # Buffer tokens — if a tool call is detected we discard them entirely to
        # avoid emitting the question text that Gemini writes before calling the tool.
        accumulated = None
        text_buffer: list[str] = []
        has_tool_calls = False
        usage_dict: dict[str, Any] | None = None

        async for chunk in llm_with_tools.astream(lc_messages):
            accumulated = chunk if accumulated is None else accumulated + chunk

            if getattr(chunk, "tool_call_chunks", None):
                has_tool_calls = True

            if isinstance(chunk.content, str) and chunk.content:
                text_buffer.append(chunk.content)
            elif isinstance(chunk.content, list):
                for part in chunk.content:
                    if isinstance(part, dict) and part.get("type") == "text" and part.get("text"):
                        text_buffer.append(part["text"])

            chunk_usage = getattr(chunk, "usage_metadata", None)
            if chunk_usage is not None:
                usage_dict = dict(chunk_usage)

        if has_tool_calls and accumulated and accumulated.tool_calls:
            # Discard text_buffer — it was the model previewing the question before
            # calling the tool. The second pass will stream the real intro text.
            yield LLMStreamEvent(
                type="tool_call_ready",
                tool_calls=list(accumulated.tool_calls),
                ai_message=accumulated,
            )
        else:
            for token in text_buffer:
                yield LLMStreamEvent(type="token", delta=token)

        yield LLMStreamEvent(type="completed", usage=usage_dict)
