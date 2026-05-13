import { useRef, useState } from "react";

import { RateLimitError, createConversation, fetchSpeech, streamChat } from "./api";
import type { ChatStreamEvent, DiagramData, KeyIdea } from "./types";

interface SpeechChunk {
  transcript: string;
  audioUrlPromise: Promise<string>;
  keyIdeas: KeyIdea[];
  diagrams: DiagramData[];
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
  error: string | null;
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
  error: null,
};

export function useLectureSession(subject: string | null) {
  const [session, setSession] = useState<LectureSession>(EMPTY);

  const convIdRef = useRef<number | null>(null);
  const chunkQueueRef = useRef<SpeechChunk[]>([]);
  const isPlayingRef = useRef(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const currentAudioUrlRef = useRef<string | null>(null);
  const activeRef = useRef(false);
  const abortRef = useRef<AbortController | null>(null);
  const lastPromptRef = useRef<string | null>(null);
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

  function abortInFlight() {
    if (abortRef.current) {
      abortRef.current.abort();
      abortRef.current = null;
    }
  }

  function playNext() {
    if (!activeRef.current) return;
    const chunk = chunkQueueRef.current.shift();
    if (!chunk) {
      isPlayingRef.current = false;
      setSession((s) => ({ ...s, agentSpeaking: false, transcript: "" }));
      return;
    }

    isPlayingRef.current = true;
    setSession((s) => ({
      ...s,
      agentSpeaking: true,
      transcript: chunk.transcript,
      keyIdeas: chunk.keyIdeas.length > 0 ? [...s.keyIdeas, ...chunk.keyIdeas] : s.keyIdeas,
      diagrams: chunk.diagrams.length > 0 ? [...s.diagrams, ...chunk.diagrams] : s.diagrams,
      currentKeyIdea: chunk.keyIdeas.length > 0 ? chunk.keyIdeas[chunk.keyIdeas.length - 1] : s.currentKeyIdea,
      currentDiagram: chunk.diagrams.length > 0 ? chunk.diagrams[chunk.diagrams.length - 1] : s.currentDiagram,
    }));

    chunk.audioUrlPromise
      .then((url) => {
        if (!url) {
          playNext();
          return;
        }
        if (!isPlayingRef.current || !activeRef.current) {
          URL.revokeObjectURL(url);
          playNext();
          return;
        }
        const audio = new Audio(url);
        audioRef.current = audio;
        currentAudioUrlRef.current = url;
        audio.onended = () => {
          URL.revokeObjectURL(url);
          if (currentAudioUrlRef.current === url) currentAudioUrlRef.current = null;
          audioRef.current = null;
          playNext();
        };
        audio.onerror = () => {
          URL.revokeObjectURL(url);
          if (currentAudioUrlRef.current === url) currentAudioUrlRef.current = null;
          audioRef.current = null;
          playNext();
        };
        void audio.play().catch(() => {
          URL.revokeObjectURL(url);
          if (currentAudioUrlRef.current === url) currentAudioUrlRef.current = null;
          playNext();
        });
      })
      .catch(() => playNext());
  }

  async function send(message: string) {
    // Increment generation — any in-flight handleEvent from a previous call will see the
    // mismatch and return early, preventing stale events from mixing into this new stream.
    const myGen = ++genRef.current;

    abortInFlight();
    stopAudio();
    lastPromptRef.current = message;
    const controller = new AbortController();
    abortRef.current = controller;
    setSession((s) => ({ ...s, agentThinking: true, agentSpeaking: false, transcript: "", error: null }));

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
    const pending = { keyIdeas: [] as KeyIdea[], diagrams: [] as DiagramData[] };

    function enqueueChunk(text: string) {
      if (genRef.current !== myGen) return;
      const trimmed = text.trim();
      if (!trimmed) return;
      const keyIdeas = pending.keyIdeas.splice(0);
      const diagrams = pending.diagrams.splice(0);
      const audioUrlPromise = fetchSpeech(trimmed).catch(() => "");
      chunkQueueRef.current.push({ transcript: trimmed, audioUrlPromise, keyIdeas, diagrams });
      if (!isPlayingRef.current) playNext();
    }

    function tryFlush() {
      const buf = tokenBuf.current;
      const pp = buf.indexOf("\n\n");
      if (pp >= 0) {
        enqueueChunk(buf.slice(0, pp));
        tokenBuf.current = buf.slice(pp + 2);
        tryFlush();
        return;
      }
      if (buf.length >= 120) {
        const match = /[.!?]\s/.exec(buf.slice(80));
        if (match) {
          const idx = 80 + match.index + match[0].length;
          enqueueChunk(buf.slice(0, idx));
          tokenBuf.current = buf.slice(idx);
        }
      }
    }

    function handleEvent(event: ChatStreamEvent) {
      // Discard events from a previous send() call.
      if (genRef.current !== myGen) return;

      if (event.event === "token") {
        tokenBuf.current += event.data.delta;
        tryFlush();
      } else if (event.event === "key_idea") {
        pending.keyIdeas.push({
          id: event.data.id,
          concept: event.data.concept,
          summary: event.data.summary,
          subject: subject ?? null,
          sr_repetitions: 0,
          sr_due_date: new Date().toISOString(),
          created_at: new Date().toISOString(),
        });
      } else if (event.event === "diagram") {
        pending.diagrams.push(event.data);
      } else if (event.event === "end") {
        enqueueChunk(tokenBuf.current);
        tokenBuf.current = "";
        const ki = pending.keyIdeas.splice(0);
        const dg = pending.diagrams.splice(0);
        if (ki.length > 0 || dg.length > 0) {
          setSession((s) => ({
            ...s,
            keyIdeas: [...s.keyIdeas, ...ki],
            diagrams: [...s.diagrams, ...dg],
            currentKeyIdea: ki.length > 0 ? ki[ki.length - 1] : s.currentKeyIdea,
            currentDiagram: dg.length > 0 ? dg[dg.length - 1] : s.currentDiagram,
          }));
        }
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
      if (abortRef.current === controller) abortRef.current = null;
    }
  }

  function retry() {
    const prompt = lastPromptRef.current;
    if (!prompt) return;
    void send(prompt);
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

  return { session, send, retry, activate, deactivate };
}
