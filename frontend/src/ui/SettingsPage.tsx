import { FormEvent, useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";

import { fetchSpeech, getCurrentUser, previewReviewDigest, updateReviewEmailPreferences, updateTutorPreferences } from "../api";
import { ThemeToggle } from "./ThemeToggle";
import { useReadingPrefs } from "../ReadingPrefsContext";
import type { FontSize, FontFamily, LineSpacing, LetterSpacing, ContentWidth } from "../readingPrefs";
import type { PendingAgentAction, ReviewEmailPreferences, TutorVoice } from "../types";
import { buttonClass } from "./buttonClass";

const POMODORO_KEY = "sapient-pomodoro";
const POMODORO_DURATION_KEY = "sapient-pomodoro-duration";
const DEFAULT_POMODORO_MINUTES = 25;
const POMODORO_MINUTE_PRESETS = [15, 25, 50] as const;

function readPomodoroMinutes(): number {
  if (typeof window === "undefined") return DEFAULT_POMODORO_MINUTES;
  const raw = window.localStorage.getItem(POMODORO_DURATION_KEY);
  const parsed = raw == null ? NaN : Number(raw);
  if (!Number.isFinite(parsed) || parsed <= 0) return DEFAULT_POMODORO_MINUTES;
  return Math.min(180, Math.max(1, Math.floor(parsed)));
}

const TONE_OPTIONS = ["Supportive", "Direct", "Encouraging", "Calm", "Playful"];
const STYLE_OPTIONS = ["Socratic guide", "Step-by-step coach", "Exam prep trainer", "Subject mentor", "Concept explainer"];
const VOICE_OPTIONS: { value: TutorVoice; label: string; description: string }[] = [
  { value: "nova", label: "Nova", description: "Balanced and clear" },
  { value: "alloy", label: "Alloy", description: "Neutral and polished" },
  { value: "ash", label: "Ash", description: "Calm and grounded" },
  { value: "coral", label: "Coral", description: "Warm and upbeat" },
  { value: "echo", label: "Echo", description: "Crisp and direct" },
  { value: "fable", label: "Fable", description: "Soft and storytelling" },
  { value: "onyx", label: "Onyx", description: "Deep and steady" },
  { value: "sage", label: "Sage", description: "Measured and thoughtful" },
  { value: "shimmer", label: "Shimmer", description: "Bright and energetic" },
];

const FONT_SIZE_OPTIONS: { label: string; value: FontSize }[] = [
  { label: "Small", value: "small" },
  { label: "Medium", value: "medium" },
  { label: "Large", value: "large" },
];

const FONT_FAMILY_OPTIONS: { label: string; value: FontFamily; description: string }[] = [
  { label: "Instrument Sans", value: "sans", description: "Default · clean" },
  { label: "Inter", value: "inter", description: "Versatile · precise" },
  { label: "Newsreader", value: "newsreader", description: "Serif · editorial" },
  { label: "Lora", value: "lora", description: "Serif · literary" },
  { label: "Monospace", value: "mono", description: "Code-like" },
  { label: "System", value: "system", description: "Your device default" },
];

const LINE_SPACING_OPTIONS: { label: string; value: LineSpacing }[] = [
  { label: "Compact", value: "compact" },
  { label: "Normal", value: "normal" },
  { label: "Relaxed", value: "relaxed" },
  { label: "Wide", value: "wide" },
];

const LETTER_SPACING_OPTIONS: { label: string; value: LetterSpacing }[] = [
  { label: "Tight", value: "tight" },
  { label: "Default", value: "normal" },
  { label: "Wide", value: "wide" },
];

const CONTENT_WIDTH_OPTIONS: { label: string; value: ContentWidth; description: string }[] = [
  { label: "Narrow", value: "narrow", description: "600 px · focused" },
  { label: "Medium", value: "medium", description: "800 px · balanced" },
  { label: "Wide", value: "wide", description: "1080 px · spacious" },
];

type Tab = "tutor" | "appearance" | "focus" | "notifications";

function Switch({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: () => void;
  label: string;
}) {
  return (
    <button
      role="switch"
      aria-checked={checked}
      aria-label={label}
      className={`switch ${checked ? "on" : ""}`}
      onClick={onChange}
      type="button"
    >
      <span className="switch-thumb" />
    </button>
  );
}

export function SettingsPage() {
  const queryClient = useQueryClient();
  const { data: user } = useQuery({ queryKey: ["me"], queryFn: getCurrentUser });
  const [tab, setTab] = useState<Tab>("tutor");
  const NAV: { id: Tab; label: string }[] = [
    { id: "tutor", label: "Tutor" },
    { id: "appearance", label: "Appearance" },
    { id: "focus", label: "Focus" },
    { id: "notifications", label: "Notifications" },
  ];
  const [tutorName, setTutorName] = useState("Sapient");
  const [tutorTone, setTutorTone] = useState("Supportive");
  const [tutorStyle, setTutorStyle] = useState("Socratic guide");
  const [tutorInstructions, setTutorInstructions] = useState("");
  const [tutorVoice, setTutorVoice] = useState<TutorVoice>("nova");
  const [previewingVoice, setPreviewingVoice] = useState<TutorVoice | null>(null);
  const previewAudioRef = useRef<HTMLAudioElement | null>(null);
  const previewUrlRef = useRef<string | null>(null);
  const {
    fontSize, setFontSize,
    fontFamily, setFontFamily,
    bionic, setBionic,
    lineSpacing, setLineSpacing,
    letterSpacing, setLetterSpacing,
    contentWidth, setContentWidth,
  } = useReadingPrefs();
  const [pomodoroEnabled, setPomodoroEnabled] = useState(() => localStorage.getItem(POMODORO_KEY) === "true");
  const [pomodoroMinutes, setPomodoroMinutesState] = useState(() => readPomodoroMinutes());

  function togglePomodoro() {
    const next = !pomodoroEnabled;
    setPomodoroEnabled(next);
    localStorage.setItem(POMODORO_KEY, String(next));
  }

  function setPomodoroMinutes(next: number) {
    const safe = Math.min(180, Math.max(1, Math.floor(next)));
    setPomodoroMinutesState(safe);
    localStorage.setItem(POMODORO_DURATION_KEY, String(safe));
  }
  const [customizationStatus, setCustomizationStatus] = useState<string | null>(null);
  const [customizationError, setCustomizationError] = useState<string | null>(null);
  const [savingCustomization, setSavingCustomization] = useState(false);
  const [reviewPrefs, setReviewPrefs] = useState<ReviewEmailPreferences & { preferred_reminder_time: string; review_email_address: string }>({
    enable_review_emails: false,
    reminder_frequency: "before_deadlines_only" as const,
    preferred_reminder_time: "",
    review_email_address: "",
    digest_style: "concise" as const,
    include_key_notes: true,
    include_outside_study_suggestions: true,
  });
  const [reviewPreview, setReviewPreview] = useState<PendingAgentAction | null>(null);
  const [reviewStatus, setReviewStatus] = useState<string | null>(null);
  const [savingReviewPrefs, setSavingReviewPrefs] = useState(false);

  useEffect(() => {
    if (!user) return;
    setTutorName(user.tutor_name || "Sapient");
    setTutorTone(user.tutor_tone || "Supportive");
    setTutorStyle(user.tutor_style || "Socratic guide");
    setTutorInstructions(user.tutor_instructions || "");
    setTutorVoice(user.tutor_voice || "nova");
    setReviewPrefs({
      enable_review_emails: user.enable_review_emails,
      reminder_frequency: user.reminder_frequency,
      preferred_reminder_time: user.preferred_reminder_time ?? "",
      review_email_address: user.review_email_address ?? user.email,
      digest_style: user.digest_style,
      include_key_notes: user.include_key_notes,
      include_outside_study_suggestions: user.include_outside_study_suggestions,
    });
  }, [user]);

  useEffect(() => {
    return () => {
      previewAudioRef.current?.pause();
      previewAudioRef.current = null;
      if (previewUrlRef.current) {
        URL.revokeObjectURL(previewUrlRef.current);
        previewUrlRef.current = null;
      }
    };
  }, []);

  async function handleSelectVoice(voice: TutorVoice) {
    setTutorVoice(voice);
    if (previewAudioRef.current) {
      previewAudioRef.current.pause();
      previewAudioRef.current = null;
    }
    if (previewUrlRef.current) {
      URL.revokeObjectURL(previewUrlRef.current);
      previewUrlRef.current = null;
    }
    setPreviewingVoice(voice);
    try {
      const name = tutorName.trim() || "Sapient";
      const url = await fetchSpeech(`Hi, I'm ${name}. Here's how I sound.`, voice);
      previewUrlRef.current = url;
      const audio = new Audio(url);
      previewAudioRef.current = audio;
      audio.onended = () => setPreviewingVoice((current) => (current === voice ? null : current));
      audio.onerror = () => setPreviewingVoice((current) => (current === voice ? null : current));
      await audio.play();
    } catch {
      setPreviewingVoice((current) => (current === voice ? null : current));
    }
  }

  async function handleTutorSubmit(event: FormEvent) {
    event.preventDefault();
    setCustomizationStatus(null);
    setCustomizationError(null);
    setSavingCustomization(true);

    try {
      const updatedUser = await updateTutorPreferences({
        tutor_name: tutorName,
        tutor_tone: tutorTone,
        tutor_style: tutorStyle,
        tutor_instructions: tutorInstructions,
        tutor_voice: tutorVoice,
      });
      queryClient.setQueryData(["me"], updatedUser);
      await queryClient.invalidateQueries({ queryKey: ["me"] });
      setCustomizationStatus("Tutor saved. New study sessions will use these preferences.");
    } catch (err) {
      setCustomizationError(err instanceof Error ? err.message : "Could not save tutor preferences.");
    } finally {
      setSavingCustomization(false);
    }
  }

  async function handleReviewSubmit(event: FormEvent) {
    event.preventDefault();
    setSavingReviewPrefs(true);
    setReviewStatus(null);
    try {
      if (reviewPrefs.enable_review_emails && !reviewPreview) {
        const preview = await previewReviewDigest(null);
        setReviewPreview(preview);
        setReviewStatus("Preview generated. Review it, then save again to enable reminders.");
        return;
      }
      const updated = await updateReviewEmailPreferences({
        ...reviewPrefs,
        preferred_reminder_time: reviewPrefs.preferred_reminder_time || null,
        review_email_address: reviewPrefs.review_email_address || null,
      });
      queryClient.setQueryData(["me"], updated);
      await queryClient.invalidateQueries({ queryKey: ["me"] });
      setReviewStatus("Review email preferences saved.");
      setReviewPreview(null);
    } catch (err) {
      setReviewStatus(err instanceof Error ? err.message : "Could not save review email preferences.");
    } finally {
      setSavingReviewPrefs(false);
    }
  }

  return (
    <div className="page-shell">
      <div className="settings-shell">

        {/* ── Sidebar ── */}
        <nav className="settings-sidebar" aria-label="Settings navigation">
          <p className="settings-sidebar-heading">Settings</p>
          {NAV.map(({ id, label }) => (
            <button
              key={id}
              className={`settings-nav-item${tab === id ? " active" : ""}`}
              onClick={() => setTab(id)}
              type="button"
            >
              {label}
            </button>
          ))}
        </nav>

        {/* ── Content ── */}
        <div className="settings-content">

          {/* Tutor */}
          {tab === "tutor" && (
            <form onSubmit={(e) => void handleTutorSubmit(e)}>
              <div className="settings-section-head">
                <h2 className="settings-section-title">Tutor</h2>
                <p className="settings-section-desc">Shape how your AI tutor sounds and teaches. Changes apply to new study sessions.</p>
              </div>

              <div className="settings-group">
                <p className="settings-group-label">Identity</p>
                <div className="settings-field-block">
                  <label className="settings-field-label-text">Name</label>
                  <input
                    className="settings-input"
                    maxLength={80}
                    onChange={(e) => setTutorName(e.target.value)}
                    placeholder="Sapient"
                    required
                    value={tutorName}
                  />
                </div>
              </div>

              <div className="settings-group">
                <p className="settings-group-label">Teaching</p>
                <div className="settings-field-block">
                  <label className="settings-field-label-text">Tone</label>
                  <div className="settings-choice-grid">
                    {TONE_OPTIONS.map((option) => (
                      <button
                        className={`settings-choice${tutorTone === option ? " selected" : ""}`}
                        key={option}
                        onClick={() => setTutorTone(option)}
                        type="button"
                      >
                        {option}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="settings-field-block" style={{ marginTop: "1rem" }}>
                  <label className="settings-field-label-text">Style</label>
                  <div className="settings-choice-grid">
                    {STYLE_OPTIONS.map((option) => (
                      <button
                        className={`settings-choice${tutorStyle === option ? " selected" : ""}`}
                        key={option}
                        onClick={() => setTutorStyle(option)}
                        type="button"
                      >
                        {option}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <div className="settings-group">
                <p className="settings-group-label">Custom instructions</p>
                <div className="settings-field-block">
                  <textarea
                    className="settings-textarea"
                    maxLength={1000}
                    onChange={(e) => setTutorInstructions(e.target.value)}
                    placeholder="E.g. Use concise examples, challenge me before explaining, connect concepts to product design."
                    rows={4}
                    value={tutorInstructions}
                  />
                  <p className="settings-hint">Appended to every session prompt. Keep it brief.</p>
                </div>
              </div>

              <div className="settings-group">
                <p className="settings-group-label">Read-aloud voice</p>
                <div className="settings-voice-grid">
                  {VOICE_OPTIONS.map((option) => (
                    <button
                      className={`settings-voice-card${tutorVoice === option.value ? " selected" : ""}${previewingVoice === option.value ? " previewing" : ""}`}
                      key={option.value}
                      onClick={() => void handleSelectVoice(option.value)}
                      type="button"
                    >
                      <strong>{option.label}</strong>
                      <span>{option.description}</span>
                      {previewingVoice === option.value && <span className="voice-preview-tag">Playing…</span>}
                    </button>
                  ))}
                </div>
                <p className="settings-hint" style={{ marginTop: "0.6rem" }}>Click a voice to hear a preview. Used when you tap <strong>Read aloud</strong>.</p>
              </div>

              <div className="tutor-preview">
                <div className="msg-avatar msg-avatar-ai">{tutorName.slice(0, 2).toUpperCase() || "SA"}</div>
                <div>
                  <strong>{tutorName || "Sapient"}</strong>
                  <p>{tutorTone} · {tutorStyle} · {VOICE_OPTIONS.find((o) => o.value === tutorVoice)?.label ?? tutorVoice}</p>
                </div>
              </div>

              {customizationStatus ? <p className="success-text" style={{ marginTop: "1rem" }}>{customizationStatus}</p> : null}
              {customizationError ? <p className="error-text" style={{ marginTop: "1rem" }}>{customizationError}</p> : null}

              <div className="settings-save-row">
                <button className={buttonClass("primary")} disabled={savingCustomization} type="submit">
                  {savingCustomization ? "Saving…" : "Save tutor"}
                </button>
              </div>
            </form>
          )}

          {/* Appearance */}
          {tab === "appearance" && (
            <div>
              <div className="settings-section-head">
                <h2 className="settings-section-title">Appearance</h2>
                <p className="settings-section-desc">Control how Sapient looks and reads.</p>
              </div>

              <div className="settings-rows">
                <div className="settings-field-row">
                  <div className="settings-field-label">
                    <span>Theme</span>
                    <p>Light or dark across the entire app.</p>
                  </div>
                  <ThemeToggle variant="icon" />
                </div>

                <div className="settings-field-row">
                  <div className="settings-field-label">
                    <span>Font size</span>
                  </div>
                  <div className="prefs-pills">
                    {FONT_SIZE_OPTIONS.map(({ label, value }) => (
                      <button className={`prefs-pill${fontSize === value ? " selected" : ""}`} key={value} onClick={() => setFontSize(value)} type="button">
                        {label}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="settings-field-row settings-field-row-block">
                  <div className="settings-field-label">
                    <span>Font</span>
                    <p>Changes the typeface across the app.</p>
                  </div>
                  <div className="settings-choice-grid settings-font-grid">
                    {FONT_FAMILY_OPTIONS.map(({ label, value, description }) => (
                      <button
                        className={`settings-choice settings-font-card${fontFamily === value ? " selected" : ""}`}
                        key={value}
                        onClick={() => setFontFamily(value)}
                        style={{ fontFamily: value === "system" ? "system-ui" : value === "mono" ? "monospace" : `"${label}"` }}
                        type="button"
                      >
                        <strong>{label}</strong>
                        <span>{description}</span>
                      </button>
                    ))}
                  </div>
                </div>

                <div className="settings-field-row">
                  <div className="settings-field-label">
                    <span>Line spacing</span>
                    <p>Controls space between lines in chat messages and notes.</p>
                  </div>
                  <div className="prefs-pills">
                    {LINE_SPACING_OPTIONS.map(({ label, value }) => (
                      <button className={`prefs-pill${lineSpacing === value ? " selected" : ""}`} key={value} onClick={() => setLineSpacing(value)} type="button">
                        {label}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="settings-field-row">
                  <div className="settings-field-label">
                    <span>Letter spacing</span>
                    <p>Adjusts space between characters. Wide can help with dense content.</p>
                  </div>
                  <div className="prefs-pills">
                    {LETTER_SPACING_OPTIONS.map(({ label, value }) => (
                      <button className={`prefs-pill${letterSpacing === value ? " selected" : ""}`} key={value} onClick={() => setLetterSpacing(value)} type="button">
                        {label}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="settings-field-row settings-field-row-block">
                  <div className="settings-field-label">
                    <span>Content width</span>
                    <p>How wide the chat and study content column is.</p>
                  </div>
                  <div className="prefs-pills">
                    {CONTENT_WIDTH_OPTIONS.map(({ label, value, description }) => (
                      <button className={`prefs-pill${contentWidth === value ? " selected" : ""}`} key={value} onClick={() => setContentWidth(value)} type="button">
                        <span>{label}</span>
                        <span style={{ fontWeight: 400, opacity: 0.7, marginLeft: "0.3em" }}>{description}</span>
                      </button>
                    ))}
                  </div>
                </div>

                <div className="settings-field-row">
                  <div className="settings-field-label">
                    <span>Bionic reading</span>
                    <p>Bolds the first half of each word to help your eyes move faster.</p>
                  </div>
                  <Switch checked={bionic} onChange={() => setBionic(!bionic)} label="Toggle bionic reading" />
                </div>
              </div>
            </div>
          )}

          {/* Focus */}
          {tab === "focus" && (
            <div>
              <div className="settings-section-head">
                <h2 className="settings-section-title">Focus</h2>
                <p className="settings-section-desc">Tools to keep study sessions structured.</p>
              </div>

              <div className="settings-rows">
                <div className="settings-field-row">
                  <div className="settings-field-label">
                    <span>Pomodoro timer</span>
                    <p>Shows a countdown in every study session and prompts a break when time is up.</p>
                  </div>
                  <Switch checked={pomodoroEnabled} onChange={togglePomodoro} label="Toggle pomodoro timer" />
                </div>

                {pomodoroEnabled && (
                  <div className="settings-field-row">
                    <div className="settings-field-label">
                      <span>Session length</span>
                    </div>
                    <div className="prefs-pills">
                      {POMODORO_MINUTE_PRESETS.map((m) => (
                        <button key={m} type="button" className={`prefs-pill${pomodoroMinutes === m ? " selected" : ""}`} onClick={() => setPomodoroMinutes(m)}>
                          {m} min
                        </button>
                      ))}
                      <input
                        type="number"
                        min={1}
                        max={180}
                        value={pomodoroMinutes}
                        onChange={(e) => setPomodoroMinutes(Number(e.target.value))}
                        className="prefs-pill prefs-pill-input"
                        aria-label="Custom pomodoro duration in minutes"
                      />
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Notifications */}
          {tab === "notifications" && (
            <form onSubmit={(e) => void handleReviewSubmit(e)}>
              <div className="settings-section-head">
                <h2 className="settings-section-title">Notifications</h2>
                <p className="settings-section-desc">Sapient can send focused review digests covering upcoming deadlines, due flashcards, and weak topics. Off by default.</p>
              </div>

              <div className="settings-rows">
                <div className="settings-field-row">
                  <div className="settings-field-label">
                    <span>Review emails</span>
                    <p>A preview email will be generated before this is turned on.</p>
                  </div>
                  <Switch
                    checked={reviewPrefs.enable_review_emails}
                    onChange={() => setReviewPrefs((c) => ({ ...c, enable_review_emails: !c.enable_review_emails }))}
                    label="Toggle review emails"
                  />
                </div>

                <div className="settings-field-row settings-field-row-block">
                  <div className="settings-field-label">
                    <span>Email address</span>
                  </div>
                  <input
                    className="settings-input"
                    type="email"
                    value={reviewPrefs.review_email_address}
                    onChange={(e) => setReviewPrefs((c) => ({ ...c, review_email_address: e.target.value }))}
                  />
                </div>

                <div className="settings-field-row">
                  <div className="settings-field-label">
                    <span>Frequency</span>
                  </div>
                  <div className="prefs-pills">
                    {(["before_deadlines_only", "daily", "weekly"] as const).map((value) => (
                      <button key={value} className={`prefs-pill${reviewPrefs.reminder_frequency === value ? " selected" : ""}`} onClick={() => setReviewPrefs((c) => ({ ...c, reminder_frequency: value }))} type="button">
                        {value === "before_deadlines_only" ? "Before deadlines" : value.charAt(0).toUpperCase() + value.slice(1)}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="settings-field-row settings-field-row-block">
                  <div className="settings-field-label">
                    <span>Preferred send time</span>
                  </div>
                  <input
                    className="settings-input settings-input-time"
                    type="time"
                    value={reviewPrefs.preferred_reminder_time}
                    onChange={(e) => setReviewPrefs((c) => ({ ...c, preferred_reminder_time: e.target.value }))}
                  />
                </div>

                <div className="settings-field-row">
                  <div className="settings-field-label">
                    <span>Digest style</span>
                  </div>
                  <div className="prefs-pills">
                    {(["concise", "detailed"] as const).map((value) => (
                      <button key={value} className={`prefs-pill${reviewPrefs.digest_style === value ? " selected" : ""}`} onClick={() => setReviewPrefs((c) => ({ ...c, digest_style: value }))} type="button">
                        {value.charAt(0).toUpperCase() + value.slice(1)}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="settings-field-row">
                  <div className="settings-field-label">
                    <span>Include key notes</span>
                    <p>Pulls your saved notes into the digest.</p>
                  </div>
                  <Switch checked={reviewPrefs.include_key_notes} onChange={() => setReviewPrefs((c) => ({ ...c, include_key_notes: !c.include_key_notes }))} label="Toggle key notes in digest" />
                </div>

                <div className="settings-field-row">
                  <div className="settings-field-label">
                    <span>Outside-study suggestions</span>
                    <p>Recommends videos or articles when you're stuck on a topic.</p>
                  </div>
                  <Switch checked={reviewPrefs.include_outside_study_suggestions} onChange={() => setReviewPrefs((c) => ({ ...c, include_outside_study_suggestions: !c.include_outside_study_suggestions }))} label="Toggle outside study suggestions" />
                </div>
              </div>

              {reviewPreview?.preview && (
                <div className="settings-preview-card">
                  <strong>{reviewPreview.preview.email_subject}</strong>
                  <p>{reviewPreview.preview.reason}</p>
                  <p className="settings-hint">Topics: {reviewPreview.preview.focus_topics.slice(0, 4).join(", ")}</p>
                </div>
              )}

              {reviewStatus ? <p className="settings-copy" style={{ marginTop: "1rem" }}>{reviewStatus}</p> : null}

              <div className="settings-save-row">
                <button className={buttonClass("primary")} disabled={savingReviewPrefs} type="submit">
                  {savingReviewPrefs ? "Saving…" : reviewPrefs.enable_review_emails && !reviewPreview ? "Preview before enabling" : "Save"}
                </button>
              </div>
            </form>
          )}

        </div>
      </div>
    </div>
  );
}
