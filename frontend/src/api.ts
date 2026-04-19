import type { ChatRequest, ChatStreamEvent, Conversation } from "./types";

function resolveDefaultApiBaseUrl(): string {
  if (typeof window === "undefined") {
    return "http://127.0.0.1:8000";
  }

  const protocol = window.location.protocol;
  const hostname = window.location.hostname || "127.0.0.1";
  return `${protocol}//${hostname}:8000`;
}

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? resolveDefaultApiBaseUrl();

function buildHeaders(userId: number, extraHeaders?: HeadersInit): Headers {
  const headers = new Headers(extraHeaders);
  headers.set("X-User-Id", String(userId));
  return headers;
}

async function parseJson<T>(response: Response): Promise<T> {
  if (!response.ok) {
    let detail = `${response.status} ${response.statusText}`;

    try {
      const body = (await response.json()) as { detail?: string };
      if (body.detail) {
        detail = body.detail;
      }
    } catch {
      // Keep the default error detail.
    }

    throw new Error(detail);
  }

  return (await response.json()) as T;
}

export async function getHealth(): Promise<{ status: string }> {
  const response = await fetch(`${API_BASE_URL}/health`);
  return parseJson(response);
}

export async function listConversations(userId: number): Promise<Conversation[]> {
  const response = await fetch(`${API_BASE_URL}/conversations`, {
    headers: buildHeaders(userId),
  });
  return parseJson(response);
}

export async function createConversation(userId: number): Promise<Conversation> {
  const response = await fetch(`${API_BASE_URL}/conversations`, {
    method: "POST",
    headers: buildHeaders(userId),
  });
  return parseJson(response);
}

export async function getConversation(userId: number, conversationId: number): Promise<Conversation> {
  const response = await fetch(`${API_BASE_URL}/conversations/${conversationId}`, {
    headers: buildHeaders(userId),
  });
  return parseJson(response);
}

function parseEventBlock(block: string): ChatStreamEvent | null {
  const lines = block.split("\n");
  let eventName = "message";
  const dataLines: string[] = [];

  for (const rawLine of lines) {
    const line = rawLine.trimEnd();
    if (!line || line.startsWith(":")) {
      continue;
    }

    if (line.startsWith("event:")) {
      eventName = line.slice(6).trim();
      continue;
    }

    if (line.startsWith("data:")) {
      dataLines.push(line.slice(5).trim());
    }
  }

  if (dataLines.length === 0) {
    return null;
  }

  return {
    event: eventName,
    data: JSON.parse(dataLines.join("\n")),
  } as ChatStreamEvent;
}

export async function streamChat(
  userId: number,
  conversationId: number,
  request: ChatRequest,
  onEvent: (event: ChatStreamEvent) => void,
): Promise<void> {
  const response = await fetch(`${API_BASE_URL}/chat/${conversationId}`, {
    method: "POST",
    headers: buildHeaders(userId, {
      "Content-Type": "application/json",
      Accept: "text/event-stream",
    }),
    body: JSON.stringify(request),
  });

  if (!response.ok) {
    throw new Error(`Streaming request failed: ${response.status} ${response.statusText}`);
  }

  if (!response.body) {
    throw new Error("Streaming response body is not available.");
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }

    buffer += decoder.decode(value, { stream: true });

    while (true) {
      const separatorIndex = buffer.indexOf("\n\n");
      if (separatorIndex === -1) {
        break;
      }

      const block = buffer.slice(0, separatorIndex);
      buffer = buffer.slice(separatorIndex + 2);

      const parsed = parseEventBlock(block);
      if (parsed) {
        onEvent(parsed);
      }
    }
  }

  const trailingBlock = buffer.trim();
  if (trailingBlock) {
    const parsed = parseEventBlock(trailingBlock);
    if (parsed) {
      onEvent(parsed);
    }
  }
}
