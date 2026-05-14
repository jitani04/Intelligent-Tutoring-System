import { useCallback, useEffect, useRef, useState } from "react";

interface PersistedState {
  durationSeconds: number;
  // When running, the absolute epoch-ms when the countdown will reach zero.
  targetMs: number | null;
  // When paused (or fresh), the remaining seconds to resume from. null = idle at full duration.
  pausedRemaining: number | null;
  expired: boolean;
}

function persistKey(conversationId: number | null): string | null {
  return conversationId != null ? `sapient-focus-timer-${conversationId}` : null;
}

function readPersisted(key: string | null, fallbackDuration: number): PersistedState {
  if (!key || typeof window === "undefined") {
    return { durationSeconds: fallbackDuration, targetMs: null, pausedRemaining: null, expired: false };
  }
  const raw = sessionStorage.getItem(key);
  if (!raw) {
    return { durationSeconds: fallbackDuration, targetMs: null, pausedRemaining: null, expired: false };
  }
  try {
    const parsed = JSON.parse(raw) as Partial<PersistedState>;
    return {
      durationSeconds: parsed.durationSeconds ?? fallbackDuration,
      targetMs: parsed.targetMs ?? null,
      pausedRemaining: parsed.pausedRemaining ?? null,
      expired: parsed.expired ?? false,
    };
  } catch {
    return { durationSeconds: fallbackDuration, targetMs: null, pausedRemaining: null, expired: false };
  }
}

function writePersisted(key: string | null, state: PersistedState) {
  if (!key || typeof window === "undefined") return;
  sessionStorage.setItem(key, JSON.stringify(state));
}

function clearPersisted(key: string | null) {
  if (!key || typeof window === "undefined") return;
  sessionStorage.removeItem(key);
}

export interface FocusTimerControls {
  /** Whole seconds remaining (counts down to 0). */
  remaining: number;
  /** Configured countdown duration in seconds. */
  durationSeconds: number;
  /** True while the countdown is ticking. */
  running: boolean;
  /** True when running and remaining > 0. (running && !expired) */
  active: boolean;
  /** True once the countdown has reached zero. */
  expired: boolean;
  /** Start (or resume) the countdown. No-op if already running or expired. */
  start: () => void;
  /** Pause a running countdown, capturing remaining for later resume. */
  pause: () => void;
  /** Reset to full duration and stop. */
  reset: () => void;
  /** Update the duration; also resets the timer. */
  setDuration: (seconds: number) => void;
}

export function useSessionTimer(
  conversationId: number | null,
  initialDurationSeconds: number,
): FocusTimerControls {
  const key = persistKey(conversationId);
  const [state, setState] = useState<PersistedState>(() => readPersisted(key, initialDurationSeconds));
  const [now, setNow] = useState(() => Date.now());

  // Re-hydrate when the conversation changes.
  useEffect(() => {
    setState(readPersisted(key, initialDurationSeconds));
    setNow(Date.now());
    // initialDurationSeconds only seeds when there's no persisted state for this conversation.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  // Tick while a target is set and not yet reached.
  useEffect(() => {
    if (state.targetMs == null) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [state.targetMs]);

  // Persist on every state change.
  useEffect(() => {
    writePersisted(key, state);
  }, [key, state]);

  let remaining: number;
  if (state.targetMs != null) {
    remaining = Math.max(0, Math.ceil((state.targetMs - now) / 1000));
  } else if (state.pausedRemaining != null) {
    remaining = state.pausedRemaining;
  } else {
    remaining = state.durationSeconds;
  }

  const running = state.targetMs != null && remaining > 0 && !state.expired;
  const expired = state.expired || (state.targetMs != null && remaining <= 0);

  // Latch expiration in persisted state so re-renders / reloads agree.
  const expiredLatchRef = useRef(false);
  useEffect(() => {
    if (expired && !state.expired && !expiredLatchRef.current) {
      expiredLatchRef.current = true;
      setState((prev) => ({ ...prev, expired: true, targetMs: null, pausedRemaining: 0 }));
    }
    if (!expired) {
      expiredLatchRef.current = false;
    }
  }, [expired, state.expired]);

  const start = useCallback(() => {
    setState((prev) => {
      if (prev.targetMs != null) return prev; // already running
      if (prev.expired) return prev; // user must reset first
      const from = prev.pausedRemaining ?? prev.durationSeconds;
      if (from <= 0) return prev;
      return {
        ...prev,
        targetMs: Date.now() + from * 1000,
        pausedRemaining: null,
        expired: false,
      };
    });
  }, []);

  const pause = useCallback(() => {
    setState((prev) => {
      if (prev.targetMs == null) return prev;
      const left = Math.max(0, Math.ceil((prev.targetMs - Date.now()) / 1000));
      return { ...prev, targetMs: null, pausedRemaining: left };
    });
  }, []);

  const reset = useCallback(() => {
    setState((prev) => ({
      durationSeconds: prev.durationSeconds,
      targetMs: null,
      pausedRemaining: null,
      expired: false,
    }));
  }, []);

  const setDuration = useCallback((seconds: number) => {
    const safe = Math.max(1, Math.floor(seconds));
    setState({ durationSeconds: safe, targetMs: null, pausedRemaining: null, expired: false });
  }, []);

  // If the conversation goes away, clear any persisted state for it.
  useEffect(() => {
    if (key == null) {
      clearPersisted(key);
    }
  }, [key]);

  return {
    remaining,
    durationSeconds: state.durationSeconds,
    running,
    active: running,
    expired,
    start,
    pause,
    reset,
    setDuration,
  };
}

export function formatTimer(seconds: number): string {
  const safe = Math.max(0, seconds);
  const m = Math.floor(safe / 60);
  const s = safe % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}
