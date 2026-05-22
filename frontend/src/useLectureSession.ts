import { useRef, useState } from "react";

import { RateLimitError, createConversation, fetchSpeech, streamChat } from "./api";
import type { ChatStreamEvent, DiagramData, ImageData, KeyIdea, RetrievedSource, StructuredDiagramData } from "./types";

export type TimelineEntry =
  | { kind: "key_idea"; idea: KeyIdea }
  | { kind: "live_note"; note: LiveLectureNote }
  | { kind: "diagram"; diagram: DiagramData }
  | { kind: "structured_diagram"; diagram: StructuredDiagramData }
  | { kind: "image"; image: ImageData };

export interface LiveLectureNote {
  id: string;
  heading: string;
  concept: string;
  summary: string;
}

interface SpeechChunk {
  displayText: string;
  spokenText: string;
  audioUrlPromise: Promise<string>;
  items: TimelineEntry[];
  pauseAfterMs?: number;
}

export interface LectureSession {
  conversationId: number | null;
  agentThinking: boolean;
  agentSpeaking: boolean;
  transcript: string;
  keyIdeas: KeyIdea[];
  currentKeyIdea: KeyIdea | null;
  diagrams: DiagramData[];
  currentDiagram: DiagramData | null;
  structuredDiagrams: StructuredDiagramData[];
  currentStructuredDiagram: StructuredDiagramData | null;
  images: ImageData[];
  currentImage: ImageData | null;
  timeline: TimelineEntry[];
  sources: RetrievedSource[];
  error: string | null;
}

interface SendOptions {
  interrupt?: boolean;
  speak?: boolean;
}

const EMPTY: LectureSession = {
  conversationId: null,
  agentThinking: false,
  agentSpeaking: false,
  transcript: "",
  keyIdeas: [],
  currentKeyIdea: null,
  diagrams: [],
  currentDiagram: null,
  structuredDiagrams: [],
  currentStructuredDiagram: null,
  images: [],
  currentImage: null,
  timeline: [],
  sources: [],
  error: null,
};

function applyTimelineItems(s: LectureSession, items: TimelineEntry[]): LectureSession {
  if (items.length === 0) return s;
  const newKeyIdeas: KeyIdea[] = [];
  const newDiagrams: DiagramData[] = [];
  const newStructuredDiagrams: StructuredDiagramData[] = [];
  const newImages: ImageData[] = [];
  for (const item of items) {
    if (item.kind === "key_idea") newKeyIdeas.push(item.idea);
    else if (item.kind === "diagram") newDiagrams.push(item.diagram);
    else if (item.kind === "structured_diagram") newStructuredDiagrams.push(item.diagram);
    else if (item.kind === "image") newImages.push(item.image);
  }
  const newKeyConcepts = new Set(newKeyIdeas.map((idea) => normalizeConcept(idea.concept)));
  const timeline = newKeyConcepts.size > 0
    ? s.timeline.filter((entry) => {
        if (entry.kind !== "live_note") return true;
        const liveConcept = normalizeConcept(entry.note.concept);
        return !Array.from(newKeyConcepts).some((concept) => concept.includes(liveConcept) || liveConcept.includes(concept));
      })
    : s.timeline;
  return {
    ...s,
    timeline: [...timeline, ...items],
    keyIdeas: newKeyIdeas.length > 0 ? [...s.keyIdeas, ...newKeyIdeas] : s.keyIdeas,
    diagrams: newDiagrams.length > 0 ? [...s.diagrams, ...newDiagrams] : s.diagrams,
    structuredDiagrams: newStructuredDiagrams.length > 0 ? [...s.structuredDiagrams, ...newStructuredDiagrams] : s.structuredDiagrams,
    images: newImages.length > 0 ? [...s.images, ...newImages] : s.images,
    currentKeyIdea: newKeyIdeas.length > 0 ? newKeyIdeas[newKeyIdeas.length - 1] : s.currentKeyIdea,
    currentDiagram: newDiagrams.length > 0 ? newDiagrams[newDiagrams.length - 1] : s.currentDiagram,
    currentStructuredDiagram: newStructuredDiagrams.length > 0 ? newStructuredDiagrams[newStructuredDiagrams.length - 1] : s.currentStructuredDiagram,
    currentImage: newImages.length > 0 ? newImages[newImages.length - 1] : s.currentImage,
  };
}

const CODE_DISPLAY_SPOKEN_PROMPT = "Read the code I displayed.";
const CODE_DISPLAY_PAUSE_MS = 10_000;

function isCodeLike(value: string): boolean {
  const trimmed = value.trim();
  if (!trimmed) return false;
  return /<!doctype\s+html|<html[\s>]|<\/[a-z][\w-]*>|^\s*(const|let|var|function|class|def|import|from|public|private|SELECT|INSERT|UPDATE|DELETE)\b/im.test(trimmed)
    || /[{};]\s*$/.test(trimmed)
    || trimmed.split("\n").filter((line) => /^\s{2,}\S/.test(line)).length >= 2;
}

function toCodeMarkdown(language: string | undefined, code: string): string {
  const safeLanguage = language?.trim().replace(/[^\w-]/g, "") ?? "";
  return `\`\`\`${safeLanguage}\n${code.trim()}\n\`\`\``;
}

function extractCodeDisplay(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return null;

  const tripleFence = trimmed.match(/```([\w-]+)?\s*\n?([\s\S]*?)```/);
  if (tripleFence && isCodeLike(tripleFence[2])) {
    return toCodeMarkdown(tripleFence[1], tripleFence[2]);
  }

  const doubleFence = trimmed.match(/^``([\w-]+)?\s+([\s\S]*?)``$/);
  if (doubleFence && isCodeLike(doubleFence[2])) {
    return toCodeMarkdown(doubleFence[1], doubleFence[2]);
  }

  const languagePrefix = trimmed.match(/^(html|css|javascript|js|typescript|ts|tsx|jsx|python|py|sql|json|bash|sh)\s+([\s\S]+)$/i);
  if (languagePrefix && isCodeLike(languagePrefix[2])) {
    return toCodeMarkdown(languagePrefix[1].toLowerCase(), languagePrefix[2]);
  }

  if (isCodeLike(trimmed) && trimmed.length >= 40) {
    return toCodeMarkdown(undefined, trimmed);
  }

  return null;
}

function hasOpenCodeFence(value: string): boolean {
  const tripleFenceCount = value.match(/```/g)?.length ?? 0;
  if (tripleFenceCount % 2 === 1) return true;

  const trimmed = value.trim();
  return trimmed.startsWith("``") && !trimmed.endsWith("``");
}

function cleanSpokenText(value: string): string {
  return value
    .replace(/```[\s\S]*?```/g, CODE_DISPLAY_SPOKEN_PROMPT)
    .replace(/\*\*(.*?)\*\*/g, "$1")
    .replace(/\*(.*?)\*/g, "$1")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/^\s*checkpoint question\s*:\s*/gim, "")
    .replace(/^\s*(checkpoint|question)\s*:\s*/gim, "")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeConcept(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function toTitleCase(value: string): string {
  return value
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(" ");
}

function extractLiveDefinitionNote(text: string, subject: string | null): LiveLectureNote | null {
  const clean = cleanSpokenText(text);
  const sentence = clean
    .split(/(?<=[.!?])\s+/)
    .find((part) => /\b(is|are|represents|refer to|refers to|means)\b/i.test(part));
  if (!sentence) return null;

  const match = sentence.match(/^(?:so,\s*)?(?:in\s+[\w\s-]+,\s*)?(?:a|an|the)\s+([a-z][a-z0-9 -]{1,48}?)\s+(is|are|represents|refer to|refers to|means)\s+(.+?)[.!?]?$/i);
  if (!match) return null;
  const rawConcept = match[1].trim();
  if (!rawConcept || /\b(it|this|that|these|those|you|we)\b/i.test(rawConcept)) return null;

  const concept = toTitleCase(rawConcept);
  const verb = match[2].toLowerCase();
  const rest = match[3].trim();
  if (rest.length < 12) return null;

  const summaryVerb = verb === "are" ? "are" : verb;
  return {
    id: `live-${normalizeConcept(concept)}-${Math.abs(sentence.length + rest.length)}`,
    heading: subject?.trim() ? toTitleCase(subject.trim()) : "Lecture Notes",
    concept,
    summary: `${concept} ${summaryVerb} ${rest.replace(/[.!?]+$/, "")}.`,
  };
}

export function useLectureSession(subject: string | null) {
  const [session, setSession] = useState<LectureSession>(EMPTY);

  const convIdRef = useRef<number | null>(null);
  const chunkQueueRef = useRef<SpeechChunk[]>([]);
  const isPlayingRef = useRef(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const currentAudioUrlRef = useRef<string | null>(null);
  const pauseTimerRef = useRef<number | null>(null);
  const activeRef = useRef(false);
  const controllersRef = useRef<Set<AbortController>>(new Set());
  const speechControllersRef = useRef<Set<AbortController>>(new Set());
  const lastPromptRef = useRef<string | null>(null);
  const playbackRateRef = useRef(1);
  // Incremented on every send() call; stale handleEvent closures detect mismatch and exit early.
  const genRef = useRef(0);

  function revokeQueuedUrls() {
    for (const chunk of chunkQueueRef.current) {
      void chunk.audioUrlPromise
        .then((url) => {
          if (url) URL.revokeObjectURL(url);
        })
        .catch(() => {});
    }
  }

  function stopAudio() {
    speechControllersRef.current.forEach((controller) => controller.abort());
    speechControllersRef.current.clear();
    if (pauseTimerRef.current != null) {
      window.clearTimeout(pauseTimerRef.current);
      pauseTimerRef.current = null;
    }
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.onended = null;
      audioRef.current.onerror = null;
      audioRef.current = null;
    }
    if (currentAudioUrlRef.current) {
      URL.revokeObjectURL(currentAudioUrlRef.current);
      currentAudioUrlRef.current = null;
    }
    revokeQueuedUrls();
    isPlayingRef.current = false;
    chunkQueueRef.current = [];
  }

  function fetchLectureSpeech(text: string): Promise<string> {
    const controller = new AbortController();
    speechControllersRef.current.add(controller);
    return fetchSpeech(text, undefined, controller.signal).finally(() => {
      speechControllersRef.current.delete(controller);
    });
  }

  function abortInFlight() {
    controllersRef.current.forEach((controller) => controller.abort());
    controllersRef.current.clear();
  }

  function playNext() {
    if (!activeRef.current) return;
    const chunk = chunkQueueRef.current.shift();
    if (!chunk) {
      isPlayingRef.current = false;
      setSession((s) => ({
        ...s,
        agentSpeaking: false,
        transcript: s.transcript.trim().startsWith("```") ? s.transcript : "",
      }));
      return;
    }

    function advanceAfterPause() {
      if (chunk?.pauseAfterMs) {
        pauseTimerRef.current = window.setTimeout(() => {
          pauseTimerRef.current = null;
          playNext();
        }, chunk.pauseAfterMs);
        return;
      }
      playNext();
    }

    isPlayingRef.current = true;
    // Apply artifacts (notes, diagrams) immediately so the notebook stays in sync with the stream,
    // but defer the spoken transcript text until audio actually starts — otherwise the user reads
    // the line several hundred ms before they hear it.
    setSession((s) => ({
      ...applyTimelineItems(s, chunk.items),
      agentSpeaking: true,
    }));

    chunk.audioUrlPromise
      .then((url) => {
        if (!url) {
          // No audio (TTS failure / non-speak chunk): still surface the text so the user isn't
          // left wondering what was said.
          setSession((s) => ({ ...s, transcript: chunk.displayText }));
          appendLiveNoteForChunk(chunk.displayText);
          advanceAfterPause();
          return;
        }
        if (!isPlayingRef.current || !activeRef.current) {
          URL.revokeObjectURL(url);
          playNext();
          return;
        }
        const audio = new Audio(url);
        audio.playbackRate = playbackRateRef.current;
        audioRef.current = audio;
        currentAudioUrlRef.current = url;
        audio.onplay = () => {
          setSession((s) => ({ ...s, transcript: chunk.displayText }));
          appendLiveNoteForChunk(chunk.displayText);
        };
        audio.onended = () => {
          URL.revokeObjectURL(url);
          if (currentAudioUrlRef.current === url) currentAudioUrlRef.current = null;
          audioRef.current = null;
          advanceAfterPause();
        };
        audio.onerror = () => {
          URL.revokeObjectURL(url);
          if (currentAudioUrlRef.current === url) currentAudioUrlRef.current = null;
          audioRef.current = null;
          advanceAfterPause();
        };
        void audio.play().catch(() => {
          URL.revokeObjectURL(url);
          if (currentAudioUrlRef.current === url) currentAudioUrlRef.current = null;
          advanceAfterPause();
        });
      })
      .catch(() => advanceAfterPause());
  }

  function appendItems(items: TimelineEntry[]) {
    if (items.length === 0) return;
    setSession((s) => applyTimelineItems(s, items));
  }

  function appendLiveNoteForChunk(text: string) {
    const note = extractLiveDefinitionNote(text, subject);
    if (!note) return;
    setSession((s) => {
      const noteKey = normalizeConcept(note.concept);
      const alreadyPresent = s.timeline.some((entry) => {
        if (entry.kind === "live_note") return normalizeConcept(entry.note.concept) === noteKey;
        if (entry.kind === "key_idea") return normalizeConcept(entry.idea.concept).includes(noteKey);
        return false;
      });
      if (alreadyPresent) return s;
      return applyTimelineItems(s, [{ kind: "live_note", note }]);
    });
  }

  async function send(message: string, options: SendOptions = {}) {
    const interrupt = options.interrupt ?? true;
    const speak = options.speak ?? true;

    // Increment generation — any in-flight handleEvent from a previous call will see the
    // mismatch and return early, preventing stale events from mixing into this new stream.
    const myGen = interrupt ? ++genRef.current : genRef.current;

    if (interrupt) {
      abortInFlight();
      stopAudio();
      lastPromptRef.current = message;
    }
    const controller = new AbortController();
    controllersRef.current.add(controller);
    setSession((s) => ({
      ...s,
      agentThinking: true,
      agentSpeaking: interrupt ? false : s.agentSpeaking,
      transcript: interrupt ? "" : s.transcript,
      error: null,
    }));

    let convId = convIdRef.current;
    if (!convId) {
      try {
        const conv = await createConversation(subject ?? undefined, { isLecture: true });
        if (genRef.current !== myGen) return;
        convId = conv.id;
        convIdRef.current = convId;
        setSession((s) => ({ ...s, conversationId: convId! }));
      } catch {
        if (genRef.current !== myGen) return;
        setSession((s) => ({ ...s, error: "Could not start lecture session.", agentThinking: false }));
        return;
      }
    }

    // Local refs for this stream only — keeps each send() isolated.
    const tokenBuf = { current: "" };
    const pending = { items: [] as TimelineEntry[] };
    // The first chunk flushes at a lower threshold so the user hears the opening line
    // sooner — TTS round-trip is the dominant first-token latency, so getting it started
    // earlier shortens the perceived "thinking" gap.
    const flushState = { firstChunkSent: false };

    function enqueueChunk(text: string) {
      if (genRef.current !== myGen) return;
      const codeDisplay = extractCodeDisplay(text);
      const displayText = codeDisplay ?? cleanSpokenText(text);
      const spokenText = codeDisplay ? CODE_DISPLAY_SPOKEN_PROMPT : cleanSpokenText(text);
      if (!displayText.trim() || !spokenText.trim()) return;
      const items = pending.items.splice(0);
      if (!speak) {
        appendItems(items);
        return;
      }
      const audioUrlPromise = fetchLectureSpeech(spokenText).catch(() => "");
      chunkQueueRef.current.push({
        displayText,
        spokenText,
        audioUrlPromise,
        items,
        pauseAfterMs: codeDisplay ? CODE_DISPLAY_PAUSE_MS : undefined,
      });
      flushState.firstChunkSent = true;
      if (!isPlayingRef.current) playNext();
    }

    function tryFlush() {
      const buf = tokenBuf.current;
      if (hasOpenCodeFence(buf)) return;

      const pp = buf.indexOf("\n\n");
      if (pp >= 0) {
        enqueueChunk(buf.slice(0, pp));
        tokenBuf.current = buf.slice(pp + 2);
        tryFlush();
        return;
      }
      const minBuf = flushState.firstChunkSent ? 120 : 40;
      const searchFrom = flushState.firstChunkSent ? 80 : 20;
      if (buf.length >= minBuf) {
        const match = /[.!?]\s/.exec(buf.slice(searchFrom));
        if (match) {
          const idx = searchFrom + match.index + match[0].length;
          enqueueChunk(buf.slice(0, idx));
          tokenBuf.current = buf.slice(idx);
          tryFlush();
        }
      }
    }

    function handleEvent(event: ChatStreamEvent) {
      // Discard events from a previous send() call.
      if (genRef.current !== myGen) return;

      if (event.event === "token") {
        if (!speak) return;
        tokenBuf.current += event.data.delta;
        tryFlush();
      } else if (event.event === "sources") {
        setSession((s) => ({ ...s, sources: event.data.sources }));
      } else if (event.event === "key_idea") {
        appendItems([{
          kind: "key_idea",
          idea: {
            id: event.data.id,
            concept: event.data.concept,
            summary: event.data.summary,
            subject: subject ?? null,
            sr_repetitions: 0,
            sr_due_date: new Date().toISOString(),
            created_at: new Date().toISOString(),
          },
        }]);
      } else if (event.event === "diagram") {
        if (speak) {
          pending.items.push({ kind: "diagram", diagram: event.data });
        } else {
          appendItems([{ kind: "diagram", diagram: event.data }]);
        }
      } else if (event.event === "structured_diagram") {
        if (speak) {
          pending.items.push({ kind: "structured_diagram", diagram: event.data });
        } else {
          appendItems([{ kind: "structured_diagram", diagram: event.data }]);
        }
      } else if (event.event === "image") {
        if (speak) {
          pending.items.push({ kind: "image", image: event.data });
        } else {
          appendItems([{ kind: "image", image: event.data }]);
        }
      } else if (event.event === "end") {
        enqueueChunk(tokenBuf.current);
        tokenBuf.current = "";
        appendItems(pending.items.splice(0));
        setSession((s) => ({ ...s, agentThinking: false }));
      } else if (event.event === "error") {
        const friendly = event.data.rate_limited && event.data.retry_after_seconds
          ? `AI is rate-limited. Try again in ~${event.data.retry_after_seconds}s.`
          : event.data.error;
        setSession((s) => ({ ...s, error: friendly, agentThinking: false }));
      }
    }

    try {
      await streamChat(convId, { message }, handleEvent, controller.signal);
    } catch (err) {
      if (genRef.current !== myGen) return;
      // AbortError on intentional cancellation — don't surface as an error.
      if (err instanceof DOMException && err.name === "AbortError") return;
      const friendly = err instanceof RateLimitError
        ? `AI is rate-limited. Try again in ~${err.retryAfterSeconds}s.`
        : err instanceof Error ? err.message : "Stream failed.";
      setSession((s) => ({
        ...s,
        error: friendly,
        agentThinking: false,
      }));
    } finally {
      controllersRef.current.delete(controller);
    }
  }

  function retry() {
    const prompt = lastPromptRef.current;
    if (!prompt) return;
    void send(prompt);
  }

  function stop() {
    genRef.current++;
    abortInFlight();
    stopAudio();
    setSession((s) => ({
      ...s,
      agentThinking: false,
      agentSpeaking: false,
      transcript: "",
      error: null,
    }));
  }

  function setPlaybackRate(rate: number) {
    playbackRateRef.current = rate;
    if (audioRef.current) {
      audioRef.current.playbackRate = rate;
    }
  }

  function activate() {
    activeRef.current = true;
    convIdRef.current = null;
    genRef.current = 0;
    lastPromptRef.current = null;
    setSession(EMPTY);
  }

  function deactivate() {
    activeRef.current = false;
    genRef.current++; // invalidate any in-flight stream
    abortInFlight();
    stopAudio();
    lastPromptRef.current = null;
    setSession(EMPTY);
  }

  return { session, send, retry, stop, setPlaybackRate, activate, deactivate };
}
