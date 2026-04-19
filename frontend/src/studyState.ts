export interface StudyContext {
  subject: string;
  topic: string;
  createdAt: string;
}

export interface SessionMetadata extends StudyContext {
  conversationId: number;
}

export interface MaterialRecord {
  id: string;
  name: string;
  subject: string;
  status: "ready" | "processing";
  source: "onboarding" | "library";
  addedAt: string;
}

const PENDING_CONTEXT_KEY = "its-pending-study-context";
const SESSION_METADATA_KEY = "its-session-metadata";
const MATERIALS_KEY = "its-materials";
const DEFAULT_USER_ID = "1";

function hasWindow(): boolean {
  return typeof window !== "undefined";
}

function readJson<T>(key: string, fallback: T): T {
  if (!hasWindow()) {
    return fallback;
  }

  const rawValue = window.localStorage.getItem(key);
  if (!rawValue) {
    return fallback;
  }

  try {
    return JSON.parse(rawValue) as T;
  } catch {
    return fallback;
  }
}

function writeJson<T>(key: string, value: T): void {
  if (!hasWindow()) {
    return;
  }

  window.localStorage.setItem(key, JSON.stringify(value));
}

function buildId(prefix: string): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return `${prefix}-${crypto.randomUUID()}`;
  }

  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export function getStoredUserId(): string {
  if (!hasWindow()) {
    return DEFAULT_USER_ID;
  }

  return window.localStorage.getItem("its-user-id") ?? DEFAULT_USER_ID;
}

export function getPendingStudyContext(): StudyContext | null {
  return readJson<StudyContext | null>(PENDING_CONTEXT_KEY, null);
}

export function setPendingStudyContext(context: StudyContext): void {
  writeJson(PENDING_CONTEXT_KEY, context);
}

export function clearPendingStudyContext(): void {
  if (!hasWindow()) {
    return;
  }

  window.localStorage.removeItem(PENDING_CONTEXT_KEY);
}

export function getSessionMetadata(): SessionMetadata[] {
  return readJson<SessionMetadata[]>(SESSION_METADATA_KEY, []);
}

export function getConversationContext(conversationId: number): SessionMetadata | null {
  return getSessionMetadata().find((entry) => entry.conversationId === conversationId) ?? null;
}

export function attachContextToConversation(conversationId: number, context: StudyContext): SessionMetadata {
  const existing = getSessionMetadata().filter((entry) => entry.conversationId !== conversationId);
  const nextEntry: SessionMetadata = { conversationId, ...context };
  writeJson(SESSION_METADATA_KEY, [nextEntry, ...existing]);
  return nextEntry;
}

export function getMaterials(): MaterialRecord[] {
  return readJson<MaterialRecord[]>(MATERIALS_KEY, []);
}

export function addMaterials(
  names: string[],
  subject: string,
  source: MaterialRecord["source"],
): MaterialRecord[] {
  const timestamp = new Date().toISOString();
  const trimmedSubject = subject.trim() || "General";
  const nextMaterials = names.map((name) => ({
    id: buildId("material"),
    name,
    subject: trimmedSubject,
    status: "ready" as const,
    source,
    addedAt: timestamp,
  }));

  const merged = [...nextMaterials, ...getMaterials()];
  writeJson(MATERIALS_KEY, merged);
  return merged;
}

export function deleteMaterial(materialId: string): MaterialRecord[] {
  const nextMaterials = getMaterials().filter((material) => material.id !== materialId);
  writeJson(MATERIALS_KEY, nextMaterials);
  return nextMaterials;
}
