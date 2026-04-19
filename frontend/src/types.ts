export type MessageRole = "user" | "assistant" | "system";

export interface Message {
  id: number;
  conversation_id: number;
  role: MessageRole;
  content: string;
  created_at: string;
}

export interface Conversation {
  id: number;
  user_id: number;
  created_at: string;
  messages: Message[];
}

export interface ChatRequest {
  message: string;
}

export interface ChatStartEvent {
  event: "start";
  data: {
    conversation_id: number;
    message_id: number | null;
  };
}

export interface ChatTokenEvent {
  event: "token";
  data: {
    delta: string;
  };
}

export interface ChatEndEvent {
  event: "end";
  data: {
    assistant_message_id: number;
    usage?: Record<string, unknown> | null;
  };
}

export interface ChatErrorEvent {
  event: "error";
  data: {
    error: string;
  };
}

export type ChatStreamEvent = ChatStartEvent | ChatTokenEvent | ChatEndEvent | ChatErrorEvent;
