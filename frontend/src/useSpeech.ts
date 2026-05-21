import { useCallback, useRef, useState } from "react";
import { RateLimitError, fetchSpeech } from "./api";

const FIRST_SPEECH_CHUNK_MAX_CHARS = 320;
const SPEECH_CHUNK_MAX_CHARS = 720;

function splitLongSentence(sentence: string, maxChars: number, firstMaxChars = maxChars): string[] {
  const chunks: string[] = [];
  let remaining = sentence.trim();
  while (remaining.length > (chunks.length === 0 ? firstMaxChars : maxChars)) {
    const limit = chunks.length === 0 ? firstMaxChars : maxChars;
    const slice = remaining.slice(0, limit + 1);
    const splitAt = Math.max(
      slice.lastIndexOf(";"),
      slice.lastIndexOf(","),
      slice.lastIndexOf(" "),
    );
    const index = splitAt > Math.floor(limit * 0.55) ? splitAt : limit;
    chunks.push(remaining.slice(0, index).trim());
    remaining = remaining.slice(index).trim();
  }
  if (remaining) chunks.push(remaining);
  return chunks;
}

function splitSpeechText(text: string): string[] {
  const normalized = text.replace(/\s+/g, " ").trim();
  if (!normalized) return [];

  const sentences = normalized.match(/[^.!?]+[.!?]+["')\]]*|[^.!?]+$/g) ?? [normalized];
  const chunks: string[] = [];
  let current = "";

  for (const rawSentence of sentences) {
    const sentence = rawSentence.trim();
    if (!sentence) continue;

    const maxChars = chunks.length === 0 ? FIRST_SPEECH_CHUNK_MAX_CHARS : SPEECH_CHUNK_MAX_CHARS;
    if (sentence.length > maxChars) {
      if (current) {
        chunks.push(current);
        current = "";
      }
      chunks.push(...splitLongSentence(sentence, SPEECH_CHUNK_MAX_CHARS, maxChars));
      continue;
    }

    const next = current ? `${current} ${sentence}` : sentence;
    if (next.length > maxChars && current) {
      chunks.push(current);
      current = sentence;
    } else {
      current = next;
    }
  }

  if (current) chunks.push(current);
  return chunks;
}

function waitForAudioEnd(audio: HTMLAudioElement): Promise<void> {
  return new Promise((resolve, reject) => {
    const cleanup = () => {
      audio.onended = null;
      audio.onerror = null;
      audio.onpause = null;
    };
    audio.onended = () => {
      cleanup();
      resolve();
    };
    audio.onpause = () => {
      cleanup();
      resolve();
    };
    audio.onerror = () => {
      cleanup();
      reject(new Error("Audio playback failed."));
    };
  });
}

export function useSpeech() {
  const [speakingId, setSpeakingId] = useState<string | null>(null);
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const blobUrlsRef = useRef<Set<string>>(new Set());
  const speechControllersRef = useRef<Set<AbortController>>(new Set());
  const runIdRef = useRef(0);

  const stop = useCallback(() => {
    runIdRef.current++;
    speechControllersRef.current.forEach((controller) => controller.abort());
    speechControllersRef.current.clear();
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }
    for (const url of blobUrlsRef.current) {
      URL.revokeObjectURL(url);
    }
    blobUrlsRef.current.clear();
    setSpeakingId(null);
    setLoadingId(null);
  }, []);

  const speak = useCallback(async (id: string, text: string) => {
    if (speakingId === id || loadingId === id) {
      stop();
      return;
    }

    stop();
    setLoadingId(id);
    setError(null);

    try {
      const runId = runIdRef.current;
      const chunks = splitSpeechText(text);
      if (chunks.length === 0) {
        setLoadingId(null);
        return;
      }

      function queueSpeechChunk(chunk: string): Promise<string> {
        const controller = new AbortController();
        speechControllersRef.current.add(controller);
        return fetchSpeech(chunk, undefined, controller.signal).finally(() => {
          speechControllersRef.current.delete(controller);
        });
      }

      let nextUrlPromise: Promise<string> | null = queueSpeechChunk(chunks[0]);

      for (let index = 0; index < chunks.length; index++) {
        if (runIdRef.current !== runId || !nextUrlPromise) return;

        const url = await nextUrlPromise;
        blobUrlsRef.current.add(url);
        nextUrlPromise = index + 1 < chunks.length ? queueSpeechChunk(chunks[index + 1]) : null;

        if (runIdRef.current !== runId) {
          URL.revokeObjectURL(url);
          blobUrlsRef.current.delete(url);
          return;
        }

        const audio = new Audio(url);
        audioRef.current = audio;
        setSpeakingId(id);
        setLoadingId(null);
        await audio.play();
        await waitForAudioEnd(audio);

        URL.revokeObjectURL(url);
        blobUrlsRef.current.delete(url);
        if (audioRef.current === audio) audioRef.current = null;
      }

      if (runIdRef.current === runId) {
        setSpeakingId(null);
        setLoadingId(null);
      }
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") return;
      setSpeakingId(null);
      setLoadingId(null);
      if (err instanceof RateLimitError) {
        setError(`Audio is rate-limited. Try again in ~${err.retryAfterSeconds}s.`);
      } else {
        setError("Audio generation failed. Try again.");
      }
    }
  }, [speakingId, loadingId, stop]);

  return { speakingId, loadingId, error, speak, stop };
}
