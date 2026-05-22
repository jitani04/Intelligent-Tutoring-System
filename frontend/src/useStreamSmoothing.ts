import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Smooths bursty SSE token streams into a typewriter render.
 *
 * Tokens land in an internal buffer via `push(delta)`. A requestAnimationFrame
 * loop flushes a few characters per frame into the React state so the visible
 * text never jumps a paragraph at a time, even when the model dumps a large
 * chunk. When the upstream stream ends, call `finish()` and any remaining
 * buffered text drains at the same pace before the loop stops.
 *
 * `reset()` clears both the rendered text and the buffer (used between turns).
 */
export interface StreamSmoothing {
  /** The currently-visible text. Updates ~60fps while there's pending buffer. */
  text: string;
  /** True once finish() has been called and the buffer has fully drained. */
  isDrained: boolean;
  /** Append a raw delta from the stream. Safe to call many times per frame. */
  push: (delta: string) => void;
  /** Signal that the upstream stream is done. The buffer will drain, then settle. */
  finish: () => void;
  /** Force the buffer to drain instantly. Useful on stream errors. */
  flush: () => void;
  /** Clear everything (between turns). */
  reset: () => void;
}

interface Options {
  /** How many chars to flush per frame at minimum. Default 2. */
  charsPerFrame?: number;
  /**
   * When the buffer grows past this many chars, accelerate so we don't fall behind.
   * The flush rate becomes ceil(buffer.length / catchUpFactor).
   * Default 30 — i.e. a 300-char buffer flushes 10 chars/frame.
   */
  catchUpFactor?: number;
}

export function useStreamSmoothing(options: Options = {}): StreamSmoothing {
  const minPerFrame = options.charsPerFrame ?? 1;
  const catchUpFactor = options.catchUpFactor ?? 60;

  const [text, setText] = useState("");
  const [isDrained, setIsDrained] = useState(true);
  const bufferRef = useRef("");
  const finishedRef = useRef(false);
  const rafRef = useRef<number | null>(null);

  const tick = useCallback(() => {
    const buf = bufferRef.current;
    if (buf.length === 0) {
      if (finishedRef.current) {
        rafRef.current = null;
        setIsDrained(true);
        return;
      }
      rafRef.current = requestAnimationFrame(tick);
      return;
    }

    const charsThisFrame = Math.max(minPerFrame, Math.ceil(buf.length / catchUpFactor));
    const flushed = buf.slice(0, charsThisFrame);
    bufferRef.current = buf.slice(charsThisFrame);
    setText((current) => current + flushed);
    rafRef.current = requestAnimationFrame(tick);
  }, [minPerFrame, catchUpFactor]);

  const ensureLoopRunning = useCallback(() => {
    if (rafRef.current != null) return;
    rafRef.current = requestAnimationFrame(tick);
  }, [tick]);

  const push = useCallback(
    (delta: string) => {
      if (!delta) return;
      bufferRef.current += delta;
      finishedRef.current = false;
      setIsDrained(false);
      ensureLoopRunning();
    },
    [ensureLoopRunning],
  );

  const finish = useCallback(() => {
    finishedRef.current = true;
    ensureLoopRunning();
  }, [ensureLoopRunning]);

  const flush = useCallback(() => {
    if (bufferRef.current.length === 0) return;
    const rest = bufferRef.current;
    bufferRef.current = "";
    setText((current) => current + rest);
  }, []);

  const reset = useCallback(() => {
    if (rafRef.current != null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    bufferRef.current = "";
    finishedRef.current = false;
    setText("");
    setIsDrained(true);
  }, []);

  useEffect(() => {
    return () => {
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
    };
  }, []);

  return { text, isDrained, push, finish, flush, reset };
}
