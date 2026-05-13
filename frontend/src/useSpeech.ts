import { useCallback, useRef, useState } from "react";
import { RateLimitError, fetchSpeech } from "./api";

export function useSpeech() {
  const [speakingId, setSpeakingId] = useState<string | null>(null);
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const blobUrlRef = useRef<string | null>(null);

  const stop = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.onended = null;
      audioRef.current.onerror = null;
      audioRef.current = null;
    }
    if (blobUrlRef.current) {
      URL.revokeObjectURL(blobUrlRef.current);
      blobUrlRef.current = null;
    }
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
      const url = await fetchSpeech(text);
      blobUrlRef.current = url;

      const audio = new Audio(url);
      audioRef.current = audio;

      audio.onended = () => {
        setSpeakingId(null);
        if (blobUrlRef.current) {
          URL.revokeObjectURL(blobUrlRef.current);
          blobUrlRef.current = null;
        }
      };
      audio.onerror = () => {
        setSpeakingId(null);
        setLoadingId(null);
      };

      setSpeakingId(id);
      setLoadingId(null);
      await audio.play();
    } catch (err) {
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
