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
  subject: string | null;
  created_at: string;
  messages: Message[];
}

export interface ChatRequest {
  message: string;
}

export type MaterialStatus = "processing" | "ready" | "failed";

export interface Material {
  id: number;
  user_id: number;
  filename: string;
  mime_type: string;
  subject: string | null;
  status: MaterialStatus;
  error_message: string | null;
  created_at: string;
  processed_at: string | null;
}

export interface RetrievedSource {
  chunk_id: number;
  material_id: number;
  material_filename: string;
  subject: string | null;
  page_number: number | null;
  snippet: string;
  similarity_score: number;
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

export interface ChatSourcesEvent {
  event: "sources";
  data: {
    sources: RetrievedSource[];
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

export interface MindMapNode {
  topic: string;
  subtopics: string[];
}

export interface MindMap {
  subject: string;
  nodes: MindMapNode[];
}

export interface ProjectProfile {
  id: number;
  subject: string;
  level: string | null;
  goals: string | null;
  mind_map: MindMap | null;
  created_at: string;
}

export interface QuizData {
  quiz_id: number;
  question: string;
  quiz_type: "multiple_choice" | "short_answer";
  options: string[] | null;
}

export interface QuizRead extends QuizData {
  id: number;
  conversation_id: number;
  created_at: string;
}

export interface AttemptResult {
  is_correct: boolean;
  correct_answer: string;
  explanation: string;
}

export interface ChatQuizEvent {
  event: "quiz";
  data: QuizData;
}

export type ChatStreamEvent = ChatStartEvent | ChatTokenEvent | ChatSourcesEvent | ChatEndEvent | ChatErrorEvent | ChatQuizEvent;
