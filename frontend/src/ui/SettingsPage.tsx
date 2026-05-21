import { FormEvent, useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";

import { fetchSpeech, getCurrentUser, previewReviewDigest, updateReviewEmailPreferences, updateTutorPreferences } from "../api";
import { ThemeToggle } from "./ThemeToggle";
import { useReadingPrefs } from "../ReadingPrefsContext";
import type { FontSize, FontFamily } from "../readingPrefs";
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

const FONT_FAMILY_OPTIONS: { label: string; value: FontFamily }[] = [
  { label: "Sans-serif", value: "sans" },
  { label: "Serif", value: "serif" },
  { label: "Monospace", value: "mono" },
];

type Tab = "tutor" | "preferences";

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
  const [tutorName, setTutorName] = useState("Sapient");
  const [tutorTone, setTutorTone] = useState("Supportive");
  const [tutorStyle, setTutorStyle] = useState("Socratic guide");
  const [tutorInstructions, setTutorInstructions] = useState("");
  const [tutorVoice, setTutorVoice] = useState<TutorVoice>("nova");
  const [previewingVoice, setPreviewingVoice] = useState<TutorVoice | null>(null);
  const previewAudioRef = useRef<HTMLAudioElement | null>(null);
  const previewUrlRef = useRef<string | null>(null);
  const { fontSize, setFontSize, fontFamily, setFontFamily, bionic, setBionic } = useReadingPrefs();
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
      <div className="page-header">
        <div className="page-header-text">
          <h1 className="page-title">Settings</h1>
        </div>
      </div>

      <div className="settings-tabs">
        <button
          className={`settings-tab${tab === "tutor" ? " active" : ""}`}
          onClick={() => setTab("tutor")}
          type="button"
        >
          Tutor
        </button>
        <button
          className={`settings-tab${tab === "preferences" ? " active" : ""}`}
          onClick={() => setTab("preferences")}
          type="button"
        >
          Preferences
        </button>
      </div>

      {tab === "tutor" && (
        <div className="settings-grid">
          <form className="content-card tutor-customization-card" onSubmit={(event) => void handleTutorSubmit(event)}>
            <div className="content-card-title">Customize your tutor</div>
            <p className="settings-copy">
              Shape how your AI tutor sounds and teaches. These preferences affect future study session responses.
            </p>

            <label className="flow-field">
              <span>Tutor name</span>
              <input
                maxLength={80}
                onChange={(event) => setTutorName(event.target.value)}
                placeholder="Sapient"
                required
                value={tutorName}
              />
            </label>

            <div className="flow-field">
              <span>Tone</span>
              <div className="settings-choice-grid">
                {TONE_OPTIONS.map((option) => (
                  <button
                    className={`settings-choice ${tutorTone === option ? "selected" : ""}`}
                    key={option}
                    onClick={() => setTutorTone(option)}
                    type="button"
                  >
                    {option}
                  </button>
                ))}
              </div>
            </div>

            <div className="flow-field">
              <span>Teaching style</span>
              <div className="settings-choice-grid">
                {STYLE_OPTIONS.map((option) => (
                  <button
                    className={`settings-choice ${tutorStyle === option ? "selected" : ""}`}
                    key={option}
                    onClick={() => setTutorStyle(option)}
                    type="button"
                  >
                    {option}
                  </button>
                ))}
              </div>
            </div>

            <label className="flow-field">
              <span>Custom instructions</span>
              <textarea
                className="settings-textarea"
                maxLength={1000}
                onChange={(event) => setTutorInstructions(event.target.value)}
                placeholder="Example: Use concise examples, challenge me before explaining, and connect concepts to product design."
                rows={5}
                value={tutorInstructions}
              />
            </label>

            <div className="flow-field">
              <span>Read-aloud voice</span>
              <div className="settings-choice-grid">
                {VOICE_OPTIONS.map((option) => (
                  <button
                    className={`settings-choice ${tutorVoice === option.value ? "selected" : ""} ${previewingVoice === option.value ? "previewing" : ""}`}
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
              <p className="settings-copy">
                This controls the voice used when you tap <strong>Read aloud</strong> on tutor responses.
              </p>
            </div>

            <div className="tutor-preview">
              <div className="msg-avatar msg-avatar-ai">{tutorName.slice(0, 2).toUpperCase() || "KP"}</div>
              <div>
                <strong>{tutorName || "Sapient"}</strong>
                <p>{tutorTone} · {tutorStyle} · {VOICE_OPTIONS.find((option) => option.value === tutorVoice)?.label ?? tutorVoice}</p>
              </div>
            </div>

            {customizationStatus ? <p className="success-text">{customizationStatus}</p> : null}
            {customizationError ? <p className="error-text">{customizationError}</p> : null}

            <div className="settings-actions">
              <button className={buttonClass("primary")} disabled={savingCustomization} type="submit">
                {savingCustomization ? "Saving…" : "Save tutor"}
              </button>
            </div>
          </form>
        </div>
      )}

      {tab === "preferences" && (
        <div className="settings-grid">
          <div className="content-card prefs-card">
            <div className="content-card-title">Appearance</div>

            <div className="prefs-row">
              <div className="prefs-row-label">
                <span>Theme</span>
                <p className="settings-copy">Light or dark across the app.</p>
              </div>
              <ThemeToggle variant="icon" />
            </div>

            <div className="prefs-row">
              <div className="prefs-row-label">
                <span>Font size</span>
              </div>
              <div className="prefs-pills">
                {FONT_SIZE_OPTIONS.map(({ label, value }) => (
                  <button
                    className={`prefs-pill ${fontSize === value ? "selected" : ""}`}
                    key={value}
                    onClick={() => setFontSize(value)}
                    type="button"
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            <div className="prefs-row">
              <div className="prefs-row-label">
                <span>Font style</span>
              </div>
              <div className="prefs-pills">
                {FONT_FAMILY_OPTIONS.map(({ label, value }) => (
                  <button
                    className={`prefs-pill ${fontFamily === value ? "selected" : ""}`}
                    key={value}
                    onClick={() => setFontFamily(value)}
                    type="button"
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            <div className="prefs-row">
              <div className="prefs-row-label">
                <span>Bionic reading</span>
                <p className="settings-copy">Bolds the first half of each word to help your eyes move faster.</p>
              </div>
              <Switch checked={bionic} onChange={() => setBionic(!bionic)} label="Toggle bionic reading" />
            </div>
          </div>

          <div className="prefs-side">
            <div className="content-card prefs-card">
              <div className="content-card-title">Focus mode</div>
              <div className="prefs-row">
                <div className="prefs-row-label">
                  <span>Pomodoro timer</span>
                  <p className="settings-copy">Countdown timer in each study session, with a break reminder when it hits zero.</p>
                </div>
                <Switch checked={pomodoroEnabled} onChange={togglePomodoro} label="Toggle pomodoro timer" />
              </div>
              {pomodoroEnabled && (
                <div className="prefs-row">
                  <div className="prefs-row-label">
                    <span>Duration</span>
                  </div>
                  <div className="prefs-pills">
                    {POMODORO_MINUTE_PRESETS.map((m) => (
                      <button
                        key={m}
                        type="button"
                        className={`prefs-pill ${pomodoroMinutes === m ? "selected" : ""}`}
                        onClick={() => setPomodoroMinutes(m)}
                      >
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

            <form className="content-card prefs-card mt-4" onSubmit={(event) => void handleReviewSubmit(event)}>
              <div className="content-card-title">Review emails</div>
              <p className="settings-copy">Sapient can prepare focused review digests for deadlines, due flashcards, and weak topics. Emails are off unless you opt in.</p>
              <div className="prefs-row">
                <div className="prefs-row-label">
                  <span>Automatic review emails</span>
                  <p className="settings-copy">You will see a preview before this is enabled.</p>
                </div>
                <Switch
                  checked={reviewPrefs.enable_review_emails}
                  onChange={() => setReviewPrefs((current) => ({ ...current, enable_review_emails: !current.enable_review_emails }))}
                  label="Toggle review emails"
                />
              </div>
              <label className="flow-field">
                <span>Email address</span>
                <input
                  type="email"
                  value={reviewPrefs.review_email_address}
                  onChange={(event) => setReviewPrefs((current) => ({ ...current, review_email_address: event.target.value }))}
                />
              </label>
              <div className="prefs-row">
                <div className="prefs-row-label"><span>Frequency</span></div>
                <div className="prefs-pills">
                  {(["before_deadlines_only", "daily", "weekly"] as const).map((value) => (
                    <button
                      key={value}
                      className={`prefs-pill ${reviewPrefs.reminder_frequency === value ? "selected" : ""}`}
                      onClick={() => setReviewPrefs((current) => ({ ...current, reminder_frequency: value }))}
                      type="button"
                    >
                      {value === "before_deadlines_only" ? "Before deadlines" : value}
                    </button>
                  ))}
                </div>
              </div>
              <label className="flow-field">
                <span>Preferred time</span>
                <input
                  type="time"
                  value={reviewPrefs.preferred_reminder_time}
                  onChange={(event) => setReviewPrefs((current) => ({ ...current, preferred_reminder_time: event.target.value }))}
                />
              </label>
              <div className="prefs-row">
                <div className="prefs-row-label"><span>Digest style</span></div>
                <div className="prefs-pills">
                  {(["concise", "detailed"] as const).map((value) => (
                    <button
                      key={value}
                      className={`prefs-pill ${reviewPrefs.digest_style === value ? "selected" : ""}`}
                      onClick={() => setReviewPrefs((current) => ({ ...current, digest_style: value }))}
                      type="button"
                    >
                      {value}
                    </button>
                  ))}
                </div>
              </div>
              <div className="prefs-row">
                <div className="prefs-row-label"><span>Include key notes</span></div>
                <Switch checked={reviewPrefs.include_key_notes} onChange={() => setReviewPrefs((current) => ({ ...current, include_key_notes: !current.include_key_notes }))} label="Toggle key notes in digest" />
              </div>
              <div className="prefs-row">
                <div className="prefs-row-label"><span>Outside-study suggestions</span></div>
                <Switch checked={reviewPrefs.include_outside_study_suggestions} onChange={() => setReviewPrefs((current) => ({ ...current, include_outside_study_suggestions: !current.include_outside_study_suggestions }))} label="Toggle outside study suggestions" />
              </div>
              {reviewPreview?.preview ? (
                <div className="rounded-xl border border-[var(--panel-border)] bg-[var(--panel-bg)] p-3 text-sm text-[var(--text)]">
                  <strong>{reviewPreview.preview.email_subject}</strong>
                  <p className="mt-1 text-[var(--text-soft)]">{reviewPreview.preview.reason}</p>
                  <p className="mt-2 text-[var(--text-soft)]">Focus: {reviewPreview.preview.focus_topics.slice(0, 4).join(", ")}</p>
                </div>
              ) : null}
              {reviewStatus ? <p className="settings-copy">{reviewStatus}</p> : null}
              <div className="settings-actions">
                <button className={buttonClass("primary")} disabled={savingReviewPrefs} type="submit">
                  {savingReviewPrefs ? "Saving..." : reviewPrefs.enable_review_emails && !reviewPreview ? "Preview before enabling" : "Save review emails"}
                </button>
              </div>
            </form>

          </div>
        </div>
      )}
    </div>
  );
}
