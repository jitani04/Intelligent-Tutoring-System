import { useEffect, useRef, useState } from "react";
// Note: no global ESC listener here — DiagramCard has its own ESC handler for fullscreen,
// and adding one here would close the lecture overlay when the user exits a fullscreen diagram.
import { createPortal } from "react-dom";
import { Brain, Gauge, Image as ImageIcon, Square } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";

import { createLectureNote } from "../api";
import { useLectureSession } from "../useLectureSession";
import { useLectureVoiceInput } from "../useLectureVoiceInput";
import { DiagramCard } from "./DiagramCard";
import { ImageArtifactCard } from "./ImageArtifactCard";
import { MarkdownText } from "./MarkdownText";

interface Props {
  subject: string | null;
  tutorName: string;
  tutorInitials: string;
  onClose: () => void;
}

const WAVEFORM_BARS = [0, 1, 2, 3, 4];

type LecturePace = "concise" | "normal" | "deep";

const PACE_OPTIONS: Array<{ value: LecturePace; label: string; instruction: string }> = [
  {
    value: "concise",
    label: "Concise",
    instruction: "Keep explanations short, prioritize definitions and one example, then ask if I want depth.",
  },
  {
    value: "normal",
    label: "Normal",
    instruction: "Teach at a steady pace with examples, checkpoints, and short transitions between ideas.",
  },
  {
    value: "deep",
    label: "Deep",
    instruction: "Go deeper with mechanisms, edge cases, and connections to prior concepts before moving on.",
  },
];

const PLAYBACK_RATES = [1, 1.25, 1.5] as const;

function paceInstruction(pace: LecturePace) {
  return PACE_OPTIONS.find((option) => option.value === pace)?.instruction ?? PACE_OPTIONS[1].instruction;
}

function buildLecturePrompt(subject: string | null, pace: LecturePace) {
  const topic = subject ? ` for ${subject}` : "";
  return `Start lecture mode${topic} by speaking first. Ask me, in one short natural sentence, what I want to cover today. Do not begin teaching, save key ideas, generate diagrams, or cite sources yet. Wait for my answer before continuing. Once I answer, act like a live human tutor speaking to me in real time: use warm conversational language, explain with simple analogies or concrete examples, and check whether I am following before moving too far ahead. When you define a term, save it as a key idea immediately so the notebook writes it on the page; use concept names like "Relational Databases: Column" and a clean standalone definition. Teach with this pacing: ${paceInstruction(pace)} Introduce or define at most 2 new concepts at a time, then pause or transition before continuing. Cite relevant uploaded materials when available. Use plain spoken text without markdown headings, bold markers, or labels like "Checkpoint Question:"; when checking understanding, ask the question naturally. Use tables only for comparisons or structured data; they render on the page, while your spoken transcript should stay caption-like. When showing code, put only the code in a fenced code block so it can be displayed rather than read aloud.`;
}

function splitStructuredTranscript(raw: string): { caption: string; pageContent: string } {
  const lines = raw.trim().split(/\r?\n/);
  const captionLines: string[] = [];
  const pageLines: string[] = [];
  let inFence = false;
  let inTable = false;

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    const trimmed = line.trim();
    const isFence = trimmed.startsWith("```");
    const isTableLine = trimmed.startsWith("|") && trimmed.endsWith("|");
    const nextTrimmed = lines[i + 1]?.trim() ?? "";
    const nextIsTableSeparator = /^\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)+\|?$/.test(nextTrimmed);

    if (isFence) {
      inFence = !inFence;
      pageLines.push(line);
      continue;
    }

    if (inFence || isTableLine || inTable) {
      pageLines.push(line);
      inTable = isTableLine || (trimmed === "" ? false : inTable);
      continue;
    }

    if (trimmed.includes("|") && nextIsTableSeparator) {
      pageLines.push(line);
      inTable = true;
      continue;
    }

    captionLines.push(line);
  }

  return {
    caption: captionLines.join("\n").trim(),
    pageContent: pageLines.join("\n").trim(),
  };
}

export function LectureModeOverlay({ subject, tutorName, tutorInitials, onClose }: Props) {
  const { session, send, retry, stop, setPlaybackRate, activate, deactivate } = useLectureSession(subject);
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState("");
  const [lecturePace, setLecturePace] = useState<LecturePace>("normal");
  const [audioRate, setAudioRate] = useState<(typeof PLAYBACK_RATES)[number]>(1);
  const inputRef = useRef<HTMLInputElement>(null);
  const notebookRef = useRef<HTMLDivElement>(null);
  const recentTutorSpeechRef = useRef("");

  useEffect(() => {
    activate();
    const prompt = buildLecturePrompt(subject, lecturePace);

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

  const stickToBottomRef = useRef(true);

  useEffect(() => {
    const node = notebookRef.current;
    if (!node) return;

    const STICK_THRESHOLD_PX = 80;

    function onScroll() {
      if (!node) return;
      const distanceFromBottom = node.scrollHeight - node.scrollTop - node.clientHeight;
      stickToBottomRef.current = distanceFromBottom <= STICK_THRESHOLD_PX;
    }

    const scrollToBottom = () => {
      if (stickToBottomRef.current) {
        node.scrollTop = node.scrollHeight;
      }
    };

    node.addEventListener("scroll", onScroll, { passive: true });
    const observer = new ResizeObserver(scrollToBottom);
    Array.from(node.children).forEach((child) => observer.observe(child));
    const mutation = new MutationObserver(() => {
      Array.from(node.children).forEach((child) => observer.observe(child));
      scrollToBottom();
    });
    mutation.observe(node, { childList: true, subtree: true });
    scrollToBottom();

    return () => {
      node.removeEventListener("scroll", onScroll);
      observer.disconnect();
      mutation.disconnect();
    };
  }, []);

  function sendLectureMessage(message: string) {
    const trimmed = message.trim();
    if (!trimmed) return;
    void send(`${trimmed}\n\nLecture controls: speak like a live tutor, not a written article. Use a clear analogy or concrete example when it helps, keep the wording conversational, and check my understanding naturally. When you define a term, save it as a key idea immediately using a topic heading plus term, like "Relational Databases: Column", and write a clean standalone definition. ${paceInstruction(lecturePace)} Introduce or define at most 2 new concepts at a time, then pause or transition before continuing. Cite relevant uploaded materials when available. Use tables only for comparisons or structured data. When showing code, put only the code in a fenced code block so it can be displayed rather than read aloud.`);
  }

  function handleSend() {
    const msg = draft.trim();
    if (!msg) return;
    setDraft("");
    sendLectureMessage(msg);
  }

  function handlePlaybackRateChange(rate: (typeof PLAYBACK_RATES)[number]) {
    setAudioRate(rate);
    setPlaybackRate(rate);
  }

  function handleCheckMe() {
    sendLectureMessage("Pause the lecture and ask me one focused check-for-understanding question about the current concept. Ask it naturally without saying or writing a label like 'Checkpoint Question'. Wait for my answer before continuing.");
  }

  function handleShowVisual() {
    void send(
      "Show the current concept visually. Use a real image when a photo/reference would help, otherwise generate a clear diagram. Only create and display the visual artifact; do not pause, restart, or continue the lecture text.",
      { interrupt: false, speak: false },
    );
  }

  async function handleClose() {
    const { timeline, keyIdeas, conversationId } = session;
    if (timeline.length > 0) {
      const firstConcept = keyIdeas[0]?.concept;
      const dateLabel = new Date().toLocaleDateString(undefined, {
        month: "short",
        day: "numeric",
        year: "numeric",
      });
      const title = firstConcept
        ? `${firstConcept} — ${dateLabel}`
        : subject
          ? `${subject} lecture — ${dateLabel}`
          : `Lecture — ${dateLabel}`;
      try {
        await createLectureNote({
          conversation_id: conversationId,
          subject,
          title,
          timeline,
        });
        await queryClient.invalidateQueries({ queryKey: ["lecture-notes", subject] });
      } catch (err) {
        console.error("Failed to save lecture note", err);
      }
    }
    deactivate();
    onClose();
  }

  const { agentSpeaking, agentThinking, transcript, currentKeyIdea, keyIdeas, timeline, error } = session;
  const busy = agentSpeaking || agentThinking;
  const { caption: liveCaption, pageContent: livePageContent } = splitStructuredTranscript(transcript);

  useEffect(() => {
    if (!transcript.trim()) return;
    recentTutorSpeechRef.current = `${recentTutorSpeechRef.current} ${transcript}`.trim().slice(-1800);
  }, [transcript]);

  const {
    supported: voiceSupported,
    listening,
    recording,
    transcribing,
    enabled: voiceEnabled,
    error: voiceError,
    toggleEnabled: toggleVoiceEnabled,
  } = useLectureVoiceInput({
    active: true,
    onSpeechStart: stop,
    onTranscript: sendLectureMessage,
    getEchoReference: () => recentTutorSpeechRef.current,
  });
  const recentConcepts = keyIdeas.slice(-4);
  const latestConcept = currentKeyIdea ?? keyIdeas[keyIdeas.length - 1] ?? null;
  const bottomStatus = agentThinking
    ? "Instructor is adding the next line to the notebook..."
    : agentSpeaking
      ? "Instructor is speaking..."
      : voiceSupported
        ? voiceEnabled
          ? recording
            ? "Listening..."
            : transcribing
              ? "Transcribing..."
              : listening
                ? "Hands-free mode is live. Speak anytime to interrupt or redirect the lecture."
                : "Hands-free mode is live and ready."
          : "The call is muted. Unmute to talk naturally."
        : "Ask for an example, a proof sketch, or a recap.";
  const bottomCaption = liveCaption || (livePageContent ? "Displaying structured content on the page." : bottomStatus);

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
        <div className="lecture-header-actions">
          <div className="lecture-control-group" aria-label="Lecture pace">
            <span className="lecture-control-label"><Gauge size={14} /> Pace</span>
            <div className="lecture-segmented">
              {PACE_OPTIONS.map((option) => (
                <button
                  key={option.value}
                  className={`lecture-segment-btn${lecturePace === option.value ? " lecture-segment-btn-active" : ""}`}
                  onClick={() => setLecturePace(option.value)}
                  type="button"
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>
          <div className="lecture-control-group" aria-label="Playback speed">
            <span className="lecture-control-label">Speed</span>
            <div className="lecture-segmented">
              {PLAYBACK_RATES.map((rate) => (
                <button
                  key={rate}
                  className={`lecture-segment-btn${audioRate === rate ? " lecture-segment-btn-active" : ""}`}
                  onClick={() => handlePlaybackRateChange(rate)}
                  type="button"
                >
                  {rate}x
                </button>
              ))}
            </div>
          </div>
          <button className="lecture-end-btn" onClick={handleClose} type="button">
            End session
          </button>
        </div>
      </div>

      <div className="lecture-main">
        <div className="lecture-notebook-shell">
          <div className="lecture-notebook-page" ref={notebookRef}>
            <div className="lecture-action-strip">
              <button className="lecture-action-btn" onClick={handleCheckMe} type="button">
                <Brain size={15} />
                Check me
              </button>
              <button className="lecture-action-btn" onClick={handleShowVisual} type="button">
                <ImageIcon size={15} />
                Show visually
              </button>
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

            {livePageContent && (
              <section className="lecture-live-block">
                <MarkdownText className="lecture-live-handwriting">{livePageContent}</MarkdownText>
              </section>
            )}

            {timeline.length > 0 && (
              <div className="lecture-notebook-stream">
                {timeline.map((entry, idx) => {
                  if (entry.kind === "key_idea") {
                    const idea = entry.idea;
                    return (
                      <article
                        key={`idea-${idea.id}-${idx}`}
                        className={`lecture-note-entry${latestConcept?.id === idea.id ? " lecture-note-entry-active" : ""}`}
                      >
                        <div className="lecture-note-marker" />
                        <div className="lecture-note-body">
                          <h3 className="lecture-note-title">{idea.concept}</h3>
                          <p className="lecture-note-copy">{idea.summary}</p>
                        </div>
                      </article>
                    );
                  }
                  if (entry.kind === "live_note") {
                    return (
                      <article
                        key={`live-note-${entry.note.id}-${idx}`}
                        className="lecture-note-entry lecture-note-entry-live"
                      >
                        <div className="lecture-note-marker" />
                        <div className="lecture-note-body">
                          <div className="lecture-note-heading">{entry.note.heading}</div>
                          <h3 className="lecture-note-title">{entry.note.concept}</h3>
                          <p className="lecture-note-copy">{entry.note.summary}</p>
                        </div>
                      </article>
                    );
                  }
                  if (entry.kind === "diagram") {
                    return (
                      <section key={`diagram-${entry.diagram.id}-${idx}`} className="lecture-sketch-section">
                        <div className="lecture-section-label">Sketch added to the page</div>
                        <div className="lecture-sketch-card">
                          <DiagramCard diagram={entry.diagram} />
                        </div>
                      </section>
                    );
                  }
                  return (
                    <section key={`image-${entry.image.id}-${idx}`} className="lecture-sketch-section">
                      <div className="lecture-section-label">Image added to the page</div>
                      <div className="lecture-sketch-card lecture-image-card-wrap">
                        <ImageArtifactCard image={entry.image} />
                      </div>
                    </section>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>

      {error && (
        <div className="lecture-error-bar">
          <span>{error}</span>
          <button
            className="lecture-retry-btn"
            disabled={agentThinking}
            onClick={() => retry()}
            type="button"
          >
            Retry
          </button>
        </div>
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
            {bottomCaption}
          </div>
        </div>
        <div className="lecture-input-controls">
          {busy && (
            <button
              className="lecture-stop-btn"
              onClick={stop}
              type="button"
              title="Stop the current lecture response"
            >
              <Square fill="currentColor" size={14} strokeWidth={2} />
              Stop
            </button>
          )}
          <button
            aria-label={voiceEnabled ? "Mute call" : "Unmute call"}
            className={`lecture-mic-btn${voiceEnabled ? " lecture-mic-on" : ""}${recording ? " lecture-mic-active" : ""}`}
            disabled={!voiceSupported}
            onClick={toggleVoiceEnabled}
            type="button"
            title={!voiceSupported ? "Voice input is not supported in this browser." : voiceEnabled ? "Mute call" : "Unmute call"}
          >
            <svg fill="none" height="17" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" viewBox="0 0 24 24" width="17">
              <rect height="11" rx="3" width="6" x="9" y="2" />
              <path d="M19 10a7 7 0 0 1-14 0" />
              <line x1="12" x2="12" y1="19" y2="23" />
              <line x1="8" x2="16" y1="23" y2="23" />
              {!voiceEnabled && <line x1="4" x2="20" y1="4" y2="20" />}
            </svg>
          </button>
          <input
            ref={inputRef}
            className="lecture-text-input"
            disabled={false}
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
            disabled={!draft.trim()}
            onClick={handleSend}
            type="button"
          >
            Add
          </button>
        </div>
      </div>
      {voiceError && (
        <div className="lecture-error-bar">{voiceError}</div>
      )}
    </div>,
    document.body,
  );
}
