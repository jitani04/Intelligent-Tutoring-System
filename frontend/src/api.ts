import { getToken } from "./auth";
import type { AttemptResult, AuthResult, ChatRequest, ChatStreamEvent, Conversation, Flashcard, FlashcardDueResponse, KeyIdea, Material, ProjectCoverImageOption, ProjectProfile, ProjectProgress, QuizRead, SearchResponse, SessionSummary, TutorPreferences, UserProfile, WeakQuizResponse } from "./types";

function resolveDefaultApiBaseUrl(): string {
  if (typeof window === "undefined") {
    return "http://127.0.0.1:8000";
  }

  const protocol = window.location.protocol;
  const hostname = window.location.hostname || "127.0.0.1";
  return `${protocol}//${hostname}:8000`;
}

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? resolveDefaultApiBaseUrl();

function buildHeaders(extraHeaders?: HeadersInit): Headers {
  const headers = new Headers(extraHeaders);
  const token = getToken();
  if (token) {
    headers.set("Authorization", `Bearer ${token}`);
  }
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

export async function register(email: string, password: string): Promise<AuthResult> {
  const response = await fetch(`${API_BASE_URL}/auth/register`, {
    method: "POST",
    headers: buildHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify({ email, password }),
  });
  return parseJson(response);
}

export async function login(email: string, password: string): Promise<AuthResult> {
  const response = await fetch(`${API_BASE_URL}/auth/login`, {
    method: "POST",
    headers: buildHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify({ email, password }),
  });
  return parseJson(response);
}

export async function loginWithGoogle(credential: string): Promise<AuthResult> {
  const response = await fetch(`${API_BASE_URL}/auth/google`, {
    method: "POST",
    headers: buildHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify({ credential }),
  });
  return parseJson(response);
}

export async function getCurrentUser(): Promise<UserProfile> {
  const response = await fetch(`${API_BASE_URL}/auth/me`, {
    headers: buildHeaders(),
  });
  return parseJson(response);
}

export async function completeOnboarding(name: string, useCase: string): Promise<UserProfile> {
  const response = await fetch(`${API_BASE_URL}/auth/onboarding`, {
    method: "POST",
    headers: buildHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify({ name, use_case: useCase }),
  });
  return parseJson(response);
}

export async function updateTutorPreferences(preferences: TutorPreferences): Promise<UserProfile> {
  const response = await fetch(`${API_BASE_URL}/auth/tutor`, {
    method: "POST",
    headers: buildHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify(preferences),
  });
  return parseJson(response);
}

export async function listConversations(): Promise<Conversation[]> {
  const response = await fetch(`${API_BASE_URL}/conversations`, {
    headers: buildHeaders(),
  });
  return parseJson(response);
}

export async function createConversation(subject?: string): Promise<Conversation> {
  const response = await fetch(`${API_BASE_URL}/conversations`, {
    method: "POST",
    headers: buildHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify({ subject: subject ?? null }),
  });
  return parseJson(response);
}

export async function getConversation(conversationId: number): Promise<Conversation> {
  const response = await fetch(`${API_BASE_URL}/conversations/${conversationId}`, {
    headers: buildHeaders(),
  });
  return parseJson(response);
}

export async function listMaterials(subject?: string): Promise<Material[]> {
  const params = new URLSearchParams();
  if (subject?.trim()) {
    params.set("subject", subject.trim());
  }

  const response = await fetch(`${API_BASE_URL}/materials${params.size ? `?${params.toString()}` : ""}`, {
    headers: buildHeaders(),
  });
  return parseJson(response);
}

interface PresignResponse {
  upload_url: string;
  key: string;
  expires_in: number;
  max_bytes: number;
  required_headers: Record<string, string>;
}

export async function uploadMaterial(file: File, subject?: string): Promise<Material> {
  const mimeType = file.type || "application/octet-stream";

  const presignResp = await fetch(`${API_BASE_URL}/materials/presign`, {
    method: "POST",
    headers: buildHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify({ filename: file.name, mime_type: mimeType }),
  });
  const presigned = await parseJson<PresignResponse>(presignResp);

  if (file.size > presigned.max_bytes) {
    throw new Error(`Upload exceeds the ${presigned.max_bytes} byte limit.`);
  }

  const putResp = await fetch(presigned.upload_url, {
    method: "PUT",
    headers: presigned.required_headers,
    body: file,
  });
  if (!putResp.ok) {
    throw new Error(`Upload failed (${putResp.status} ${putResp.statusText}).`);
  }

  const createResp = await fetch(`${API_BASE_URL}/materials`, {
    method: "POST",
    headers: buildHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify({
      filename: file.name,
      mime_type: mimeType,
      subject: subject?.trim() || null,
      key: presigned.key,
    }),
  });
  return parseJson(createResp);
}

export interface MaterialPreview {
  url: string;
  expires_in: number;
  mime_type: string;
  filename: string;
}

export async function getMaterialPreviewUrl(materialId: number): Promise<MaterialPreview> {
  const response = await fetch(`${API_BASE_URL}/materials/${materialId}/preview-url`, {
    headers: buildHeaders(),
  });
  return parseJson(response);
}

export async function getProjectProfile(subject: string): Promise<ProjectProfile> {
  const response = await fetch(`${API_BASE_URL}/projects/${encodeURIComponent(subject)}`, {
    headers: buildHeaders(),
  });
  return parseJson(response);
}

export async function listProjectProfiles(): Promise<ProjectProfile[]> {
  const response = await fetch(`${API_BASE_URL}/projects`, {
    headers: buildHeaders(),
  });
  return parseJson(response);
}

export async function searchProjectCoverImages(query: string): Promise<ProjectCoverImageOption[]> {
  const response = await fetch(`${API_BASE_URL}/projects/cover-images/search?query=${encodeURIComponent(query)}`, {
    headers: buildHeaders(),
  });
  return parseJson(response);
}

export async function setupProject(
  subject: string,
  level: string | null,
  goals: string | null,
  coverImageUrl: string | null,
  coverImageSource: string | null = null,
  coverImageSourceUrl: string | null = null,
  coverImagePhotographer: string | null = null,
  coverImagePhotographerUrl: string | null = null,
): Promise<ProjectProfile> {
  const response = await fetch(`${API_BASE_URL}/projects/${encodeURIComponent(subject)}/setup`, {
    method: "POST",
    headers: buildHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify({
      subject,
      level,
      goals,
      cover_image_url: coverImageUrl,
      cover_image_source: coverImageSource,
      cover_image_source_url: coverImageSourceUrl,
      cover_image_photographer: coverImagePhotographer,
      cover_image_photographer_url: coverImagePhotographerUrl,
    }),
  });
  return parseJson(response);
}

export async function searchAll(q: string): Promise<SearchResponse> {
  const response = await fetch(`${API_BASE_URL}/search?q=${encodeURIComponent(q)}`, {
    headers: buildHeaders(),
  });
  return parseJson(response);
}

export async function transcribeAudio(blob: Blob, filename: string): Promise<string> {
  const formData = new FormData();
  formData.append("audio", blob, filename);
  const response = await fetch(`${API_BASE_URL}/stt`, {
    method: "POST",
    headers: buildHeaders(),
    body: formData,
  });
  return parseJson<{ text: string }>(response).then((r) => r.text);
}

export async function generateWeakQuiz(subject: string): Promise<WeakQuizResponse> {
  const response = await fetch(`${API_BASE_URL}/projects/${encodeURIComponent(subject)}/weak-quiz`, {
    method: "POST",
    headers: buildHeaders(),
  });
  return parseJson(response);
}

export async function getProjectProgress(subject: string): Promise<ProjectProgress> {
  const response = await fetch(`${API_BASE_URL}/projects/${encodeURIComponent(subject)}/progress`, {
    headers: buildHeaders(),
  });
  return parseJson(response);
}

export async function generateMindMap(subject: string): Promise<ProjectProfile> {
  const response = await fetch(`${API_BASE_URL}/projects/${encodeURIComponent(subject)}/mindmap`, {
    method: "POST",
    headers: buildHeaders(),
  });
  return parseJson(response);
}

export async function getConversationQuizzes(conversationId: number): Promise<QuizRead[]> {
  const response = await fetch(`${API_BASE_URL}/conversations/${conversationId}/quizzes`, {
    headers: buildHeaders(),
  });
  return parseJson(response);
}

export async function submitQuizAttempt(quizId: number, answer: string): Promise<AttemptResult> {
  const response = await fetch(`${API_BASE_URL}/quizzes/${quizId}/attempt`, {
    method: "POST",
    headers: buildHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify({ answer }),
  });
  return parseJson(response);
}

export async function skipQuizQuestion(quizId: number): Promise<AttemptResult> {
  const response = await fetch(`${API_BASE_URL}/quizzes/${quizId}/skip`, {
    method: "POST",
    headers: buildHeaders(),
  });
  return parseJson(response);
}

export async function getKeyIdeas(conversationId: number): Promise<KeyIdea[]> {
  const response = await fetch(`${API_BASE_URL}/conversations/${conversationId}/key-ideas`, {
    headers: buildHeaders(),
  });
  return parseJson(response);
}

export async function listAllKeyIdeas(subject?: string, q?: string): Promise<KeyIdea[]> {
  const params = new URLSearchParams();
  if (subject) params.set("subject", subject);
  if (q) params.set("q", q);
  const qs = params.toString();
  const response = await fetch(`${API_BASE_URL}/key-ideas${qs ? `?${qs}` : ""}`, {
    headers: buildHeaders(),
  });
  return parseJson(response);
}

export async function promoteKeyIdea(ideaId: number): Promise<KeyIdea> {
  const response = await fetch(`${API_BASE_URL}/key-ideas/${ideaId}/promote`, {
    method: "POST",
    headers: buildHeaders(),
  });
  return parseJson(response);
}

export async function deleteKeyIdea(ideaId: number): Promise<void> {
  const response = await fetch(`${API_BASE_URL}/key-ideas/${ideaId}`, {
    method: "DELETE",
    headers: buildHeaders(),
  });
  if (!response.ok) {
    await parseJson(response);
  }
}

export async function generateSummary(conversationId: number): Promise<SessionSummary> {
  const response = await fetch(`${API_BASE_URL}/conversations/${conversationId}/summary`, {
    method: "POST",
    headers: buildHeaders(),
  });
  return parseJson(response);
}

export async function getDueFlashcards(subject?: string): Promise<FlashcardDueResponse> {
  const params = new URLSearchParams();
  if (subject?.trim()) {
    params.set("subject", subject.trim());
  }

  const response = await fetch(`${API_BASE_URL}/flashcards/due${params.size ? `?${params.toString()}` : ""}`, {
    headers: buildHeaders(),
  });
  return parseJson(response);
}

export async function reviewFlashcard(cardId: number, quality: number): Promise<Flashcard> {
  const response = await fetch(`${API_BASE_URL}/flashcards/${cardId}/review`, {
    method: "POST",
    headers: buildHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify({ quality }),
  });
  return parseJson(response);
}

export async function fetchSpeech(text: string): Promise<string> {
  const response = await fetch(`${API_BASE_URL}/tts`, {
    method: "POST",
    headers: buildHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify({ text }),
  });
  if (!response.ok) {
    throw new Error(`TTS failed: ${response.status}`);
  }
  const blob = await response.blob();
  return URL.createObjectURL(blob);
}

export async function deleteMaterial(materialId: number): Promise<void> {
  const response = await fetch(`${API_BASE_URL}/materials/${materialId}`, {
    method: "DELETE",
    headers: buildHeaders(),
  });

  if (!response.ok) {
    await parseJson(response);
  }
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
  conversationId: number,
  request: ChatRequest,
  onEvent: (event: ChatStreamEvent) => void,
): Promise<void> {
  const response = await fetch(`${API_BASE_URL}/chat/${conversationId}`, {
    method: "POST",
    headers: buildHeaders({
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
