import { useEffect, useMemo, useRef, useState } from "react";
// Note: no global ESC listener here — DiagramCard has its own ESC handler for fullscreen,
// and adding one here would close the lecture overlay when the user exits a fullscreen diagram.
import { createPortal } from "react-dom";

import { useLectureSession } from "../useLectureSession";
import { useContinuousSpeechRecognition } from "../useContinuousSpeechRecognition";
import { DiagramCard } from "./DiagramCard";

interface Props {
  subject: string | null;
  tutorName: string;
  tutorInitials: string;
  onClose: () => void;
}

const WAVEFORM_BARS = [0, 1, 2, 3, 4];

export function LectureModeOverlay({ subject, tutorName, tutorInitials, onClose }: Props) {
  const { session, send, activate, deactivate } = useLectureSession(subject);
  const [draft, setDraft] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const notebookRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    activate();
    const prompt = subject
      ? `Give me a lecture on ${subject}. Introduce the core concepts one by one, explain each clearly with examples, and save key ideas as notes. Generate a concept diagram when it helps illustrate structure.`
      : "Give me a lecture on the topic I'm currently studying. Introduce the core concepts one by one with clear explanations and examples. Save key ideas as notes.";

    // In React StrictMode, dev builds mount, unmount, and remount once.
    // Deferring the auto-start send lets the first synthetic mount cancel cleanly
    // so the opening lecture prompt only fires from the real mounted instance.
    const startTimer = window.setTimeout(() => {
      void send(prompt);
    }, 0);

    return () => {
      window.clearTimeout(startTimer);
      deactivate();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (notebookRef.current) {
      notebookRef.current.scrollTop = notebookRef.current.scrollHeight;
    }
  }, [session.keyIdeas.length, session.diagrams.length, session.transcript]);


  function handleSend() {
    const msg = draft.trim();
    if (!msg || session.agentThinking) return;
    setDraft("");
    void send(msg);
  }

  function handleClose() {
    deactivate();
    onClose();
  }

  const { agentSpeaking, agentThinking, transcript, currentDiagram, currentKeyIdea, keyIdeas, diagrams, error } = session;
  const busy = agentSpeaking || agentThinking;
  const handsFreeActive = !busy;
  const {
    supported: speechSupported,
    listening,
    enabled: speechEnabled,
    error: speechError,
    toggleEnabled: toggleSpeechEnabled,
  } = useContinuousSpeechRecognition((text) => {
    if (busy) return;
    void send(text);
  }, handsFreeActive);
  const pageHeading = subject ?? "Open lecture notes";
  const statusLabel = agentThinking
    ? "Drafting the next explanation"
    : agentSpeaking
      ? "Speaking through the idea"
      : speechSupported
        ? speechEnabled
          ? listening
            ? "Call live: listening"
            : "Call live: ready for you"
          : "Call muted"
        : "Notebook ready";
  const liveText = transcript || (agentThinking ? "Let me sketch this out in the margins..." : "");
  const recentConcepts = keyIdeas.slice(-4);
  const notebookEmpty = keyIdeas.length === 0 && diagrams.length === 0 && !liveText;
  const latestDiagram = currentDiagram ?? diagrams[diagrams.length - 1] ?? null;
  const latestConcept = currentKeyIdea ?? keyIdeas[keyIdeas.length - 1] ?? null;
  const notebookDate = useMemo(
    () => new Date().toLocaleDateString([], { month: "short", day: "numeric", year: "numeric" }),
    [],
  );

  return createPortal(
    <div className="lecture-overlay">
      <div className="lecture-header">
        <div className="lecture-header-left">
          <div className="lecture-avatar-sm">{tutorInitials}</div>
          <div>
            <div className="lecture-tutor-name">{tutorName}</div>
            {subject && <div className="lecture-subject">{subject}</div>}
          </div>
        </div>
        <button className="lecture-end-btn" onClick={handleClose} type="button">
          End session
        </button>
      </div>

      <div className="lecture-main">
        <div className="lecture-notebook-shell">
          <div className="lecture-notebook-page" ref={notebookRef}>
            <div className="lecture-page-meta">
              <span>Lecture notes</span>
              <span>{notebookDate}</span>
            </div>
            <div className="lecture-page-heading-row">
              <div>
                <div className="lecture-page-kicker">Topic</div>
                <h2 className="lecture-page-title">{pageHeading}</h2>
              </div>
              <div className="lecture-page-status">{statusLabel}</div>
            </div>

            {recentConcepts.length > 0 && (
              <div className="lecture-concept-ribbon">
                {recentConcepts.map((idea) => (
                  <span
                    key={idea.id}
                    className={`lecture-concept-pill${latestConcept?.id === idea.id ? " lecture-concept-pill-active" : ""}`}
                  >
                    {idea.concept}
                  </span>
                ))}
              </div>
            )}

            {(liveText || busy) && (
              <section className="lecture-live-block">
                <div className="lecture-section-label">Now writing</div>
                <p className="lecture-live-handwriting">{liveText || "Thinking through the next section..."}</p>
              </section>
            )}

            {notebookEmpty ? (
              <div className="lecture-idle-state">
                <div className={`lecture-avatar-lg${agentThinking ? " lecture-avatar-pulse" : ""}`}>
                  {tutorInitials}
                </div>
                <div className="lecture-idle-label">
                  {subject ? `Starting notes for ${subject}` : "Starting a fresh notebook page"}
                </div>
              </div>
            ) : (
              <div className="lecture-notebook-stream">
                {keyIdeas.map((idea, index) => (
                  <article
                    key={idea.id}
                    className={`lecture-note-entry${latestConcept?.id === idea.id ? " lecture-note-entry-active" : ""}`}
                    style={{ transform: `rotate(${index % 2 === 0 ? -0.45 : 0.35}deg)` }}
                  >
                    <div className="lecture-note-marker" />
                    <div className="lecture-note-body">
                      <h3 className="lecture-note-title">{idea.concept}</h3>
                      <p className="lecture-note-copy">{idea.summary}</p>
                    </div>
                  </article>
                ))}

                {latestDiagram && (
                  <section className="lecture-sketch-section">
                    <div className="lecture-section-label">Sketch added to the page</div>
                    <div className="lecture-sketch-card">
                      <DiagramCard diagram={latestDiagram} />
                    </div>
                  </section>
                )}
              </div>
            )}

            <div className="lecture-page-footer">
              <span>Ask follow-ups and the notes keep building.</span>
              <span>{keyIdeas.length} note{keyIdeas.length === 1 ? "" : "s"}</span>
            </div>
          </div>
        </div>
      </div>

      {error && (
        <div className="lecture-error-bar">{error}</div>
      )}

      <div className="lecture-input-bar">
        <div className={`lecture-speaker-row${busy ? " lecture-speaker-row-visible" : ""}`}>
          <div className={`lecture-waveform${agentSpeaking ? " lecture-waveform-active" : " lecture-waveform-thinking"}`}>
            {WAVEFORM_BARS.map((i) => (
              <div
                key={i}
                className="lecture-wave-bar"
                style={{ animationDelay: `${i * 0.08}s` }}
              />
            ))}
          </div>
          <div className="lecture-current-text">
            {transcript || (
              agentThinking
                ? "Instructor is adding the next line to the notebook..."
                : speechSupported
                  ? speechEnabled
                    ? listening
                      ? "Hands-free mode is live. Speak normally when the tutor finishes."
                      : "The call will reopen your mic when the tutor finishes speaking."
                    : "The call is muted. Unmute to talk naturally."
                  : "Ask for an example, a proof sketch, or a recap."
            )}
          </div>
        </div>
        <div className="lecture-input-controls">
          <button
            aria-label={speechEnabled ? "Mute call" : "Unmute call"}
            className={`lecture-mic-btn${speechEnabled ? " lecture-mic-active" : ""}`}
            disabled={!speechSupported}
            onClick={toggleSpeechEnabled}
            type="button"
            title={!speechSupported ? "Speech recognition is not supported in this browser." : speechEnabled ? "Mute call" : "Unmute call"}
          >
            <svg fill="none" height="17" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" viewBox="0 0 24 24" width="17">
              <rect height="11" rx="3" width="6" x="9" y="2" />
              <path d="M19 10a7 7 0 0 1-14 0" />
              <line x1="12" x2="12" y1="19" y2="23" />
              <line x1="8" x2="16" y1="23" y2="23" />
              {!speechEnabled && <line x1="4" x2="20" y1="4" y2="20" />}
            </svg>
          </button>
          <input
            ref={inputRef}
            className="lecture-text-input"
            disabled={agentThinking}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleSend();
            }}
            placeholder="Ask a question or request a new section…"
            type="text"
            value={draft}
          />
          <button
            className="lecture-send-btn"
            disabled={!draft.trim() || agentThinking}
            onClick={handleSend}
            type="button"
          >
            Add
          </button>
        </div>
      </div>
      {speechError && (
        <div className="lecture-error-bar">{speechError}</div>
      )}
    </div>,
    document.body,
  );
}
