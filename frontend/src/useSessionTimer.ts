import { useEffect, useRef, useState } from "react";

export function useSessionTimer(conversationId: number | null) {
  const storageKey = conversationId != null ? `kp-timer-${conversationId}` : null;

  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const startedAtRef = useRef(startedAt);
  startedAtRef.current = startedAt;

  // Re-hydrate from sessionStorage when the conversation changes
  useEffect(() => {
    if (!storageKey) {
      setStartedAt(null);
      setElapsed(0);
      return;
    }
    const saved = sessionStorage.getItem(storageKey);
    if (saved) {
      const t = Number(saved);
      setStartedAt(t);
      setElapsed(Math.floor((Date.now() - t) / 1000));
    } else {
      setStartedAt(null);
      setElapsed(0);
    }
  }, [storageKey]);

  // Tick every second while active
  useEffect(() => {
    if (startedAt == null) return;
    const id = setInterval(() => {
      setElapsed(Math.floor((Date.now() - startedAt) / 1000));
    }, 1000);
    return () => clearInterval(id);
  }, [startedAt]);

  function start() {
    if (startedAtRef.current != null) return;
    const now = Date.now();
    setStartedAt(now);
    setElapsed(0);
    if (storageKey) sessionStorage.setItem(storageKey, String(now));
  }

  function reset() {
    setStartedAt(null);
    setElapsed(0);
    if (storageKey) sessionStorage.removeItem(storageKey);
  }

  return { elapsed, active: startedAt != null, start, reset };
}

export function formatTimer(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}
