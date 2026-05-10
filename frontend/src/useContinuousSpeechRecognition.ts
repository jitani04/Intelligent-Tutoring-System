import { useEffect, useRef, useState } from "react";

type RecognitionCtor = new () => SpeechRecognitionLike;

interface SpeechRecognitionLike extends EventTarget {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onerror: ((event: SpeechRecognitionErrorLike) => void) | null;
  onend: (() => void) | null;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  start: () => void;
  stop: () => void;
}

interface SpeechRecognitionAlternativeLike {
  transcript: string;
}

interface SpeechRecognitionResultLike {
  isFinal: boolean;
  0: SpeechRecognitionAlternativeLike;
}

interface SpeechRecognitionEventLike {
  resultIndex: number;
  results: SpeechRecognitionResultLike[];
}

interface SpeechRecognitionErrorLike {
  error: string;
}

declare global {
  interface Window {
    SpeechRecognition?: RecognitionCtor;
    webkitSpeechRecognition?: RecognitionCtor;
  }
}

function getSpeechRecognitionCtor(): RecognitionCtor | null {
  return window.SpeechRecognition ?? window.webkitSpeechRecognition ?? null;
}

export function useContinuousSpeechRecognition(
  onTranscript: (text: string) => void,
  active: boolean,
) {
  const [supported] = useState(() => typeof window !== "undefined" && !!getSpeechRecognitionCtor());
  const [listening, setListening] = useState(false);
  const [enabled, setEnabled] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const shouldListenRef = useRef(false);
  const restartingRef = useRef(false);
  const onTranscriptRef = useRef(onTranscript);

  useEffect(() => {
    onTranscriptRef.current = onTranscript;
  }, [onTranscript]);

  useEffect(() => {
    shouldListenRef.current = active && enabled;
  }, [active, enabled]);

  useEffect(() => {
    if (!supported) return;

    const Recognition = getSpeechRecognitionCtor();
    if (!Recognition) return;

    const recognition = new Recognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = "en-US";

    recognition.onresult = (event) => {
      let finalTranscript = "";
      for (let i = event.resultIndex; i < event.results.length; i += 1) {
        const result = event.results[i];
        if (result.isFinal) {
          finalTranscript += result[0]?.transcript ?? "";
        }
      }
      const cleaned = finalTranscript.trim();
      if (cleaned) {
        onTranscriptRef.current(cleaned);
      }
    };

    recognition.onerror = (event) => {
      restartingRef.current = false;
      setListening(false);

      if (event.error === "not-allowed" || event.error === "service-not-allowed") {
        setEnabled(false);
        setError("Microphone access denied.");
        return;
      }

      if (event.error === "no-speech" || event.error === "aborted") {
        return;
      }

      setError("Voice recognition stopped unexpectedly.");
    };

    recognition.onend = () => {
      setListening(false);
      restartingRef.current = false;

      if (shouldListenRef.current) {
        window.setTimeout(() => {
          if (!recognitionRef.current || !shouldListenRef.current || restartingRef.current) return;
          try {
            restartingRef.current = true;
            recognitionRef.current.start();
            setListening(true);
          } catch {
            restartingRef.current = false;
          }
        }, 250);
      }
    };

    recognitionRef.current = recognition;
    return () => {
      shouldListenRef.current = false;
      recognition.onresult = null;
      recognition.onerror = null;
      recognition.onend = null;
      try {
        recognition.stop();
      } catch {
        // Ignore stop errors during teardown.
      }
      recognitionRef.current = null;
    };
  }, [supported]);

  useEffect(() => {
    if (!supported) return;
    const recognition = recognitionRef.current;
    if (!recognition) return;

    if (active && enabled) {
      setError(null);
      if (!listening && !restartingRef.current) {
        try {
          restartingRef.current = true;
          recognition.start();
          setListening(true);
        } catch {
          restartingRef.current = false;
        }
      }
      return;
    }

    if (listening || restartingRef.current) {
      shouldListenRef.current = false;
      restartingRef.current = false;
      try {
        recognition.stop();
      } catch {
        // Ignore stop errors when pausing recognition.
      }
      setListening(false);
    }
  }, [active, enabled, listening, supported]);

  function toggleEnabled() {
    if (!supported) return;
    setEnabled((current) => !current);
    setError(null);
  }

  return { supported, listening, enabled, error, toggleEnabled };
}
