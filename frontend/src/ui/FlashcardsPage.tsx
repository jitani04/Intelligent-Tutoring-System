import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate, useParams } from "react-router-dom";
import { createConversation, getDueFlashcards, reviewFlashcard } from "../api";
import type { Flashcard } from "../types";

const RATINGS: { label: string; quality: number; className: string }[] = [
  { label: "Again", quality: 1, className: "flash-btn-again" },
  { label: "Hard",  quality: 3, className: "flash-btn-hard" },
  { label: "Good",  quality: 4, className: "flash-btn-good" },
  { label: "Easy",  quality: 5, className: "flash-btn-easy" },
];

function intervalLabel(days: number): string {
  if (days === 1) return "tomorrow";
  if (days < 7) return `${days} days`;
  if (days < 30) return `${Math.round(days / 7)} week${Math.round(days / 7) !== 1 ? "s" : ""}`;
  return `${Math.round(days / 30)} month${Math.round(days / 30) !== 1 ? "s" : ""}`;
}

export function FlashcardsPage() {
  const { subject } = useParams<{ subject: string }>();
  const decodedSubject = decodeURIComponent(subject ?? "");
  const encodedSubject = encodeURIComponent(decodedSubject);
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [index, setIndex] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [sessionDone, setSessionDone] = useState<{ reviewed: number } | null>(null);
  const [reviewed, setReviewed] = useState(0);

  const { data, isLoading } = useQuery({
    queryKey: ["flashcards-due", decodedSubject],
    queryFn: () => getDueFlashcards(decodedSubject),
    enabled: Boolean(decodedSubject),
    staleTime: 0,
  });

  const newSessionMutation = useMutation({
    mutationFn: () => createConversation(decodedSubject),
    onSuccess: (conversation) => {
      navigate(`/sessions/${conversation.id}`);
    },
  });

  const cards: Flashcard[] = data?.cards ?? [];
  const total = cards.length;
  const current = cards[index] ?? null;

  if (!decodedSubject) {
    return (
      <div className="page-shell">
        <div className="empty-state">
          <div className="empty-state-icon">?</div>
          <h3>Subject not found</h3>
          <p>Open flashcards from a specific subject.</p>
          <Link className="button button-primary" to="/dashboard">Back to dashboard</Link>
        </div>
      </div>
    );
  }

  async function handleRate(quality: number) {
    if (!current || submitting) return;
    setSubmitting(true);
    try {
      await reviewFlashcard(current.id, quality);
      const nextReviewed = reviewed + 1;
      setReviewed(nextReviewed);

      if (index + 1 >= total) {
        setSessionDone({ reviewed: nextReviewed });
        void queryClient.invalidateQueries({ queryKey: ["flashcards-due", decodedSubject] });
      } else {
        setIndex((i) => i + 1);
        setFlipped(false);
      }
    } finally {
      setSubmitting(false);
    }
  }

  function handleRestart() {
    setIndex(0);
    setFlipped(false);
    setReviewed(0);
    setSessionDone(null);
    void queryClient.invalidateQueries({ queryKey: ["flashcards-due", decodedSubject] });
  }

  if (isLoading) {
    return (
      <div className="page-shell flash-center">
        <p className="muted">Loading your cards…</p>
      </div>
    );
  }

  if (sessionDone || total === 0) {
    return (
      <div className="page-shell flash-center">
        <div className="flash-done">
          <div className="flash-done-icon">✦</div>
          <h2>All caught up!</h2>
          {sessionDone && sessionDone.reviewed > 0 ? (
            <p>You reviewed {sessionDone.reviewed} card{sessionDone.reviewed !== 1 ? "s" : ""} this study session.</p>
          ) : (
            <p>No {decodedSubject} cards are due right now. Keep studying to build your deck.</p>
          )}
          <div className="flash-done-actions">
            {sessionDone && (
              <button className="button button-secondary" onClick={handleRestart} type="button">
                Check for more
              </button>
            )}
            <Link className="button button-secondary" to={`/projects/${encodedSubject}`}>Open subject</Link>
            <button
              className="button button-primary"
              disabled={newSessionMutation.isPending}
              onClick={() => newSessionMutation.mutate()}
              type="button"
            >
              {newSessionMutation.isPending ? "Creating…" : "Start a study session"}
            </button>
          </div>
        </div>
      </div>
    );
  }

  const progress = (index / total) * 100;

  return (
    <div className="page-shell">
      <div className="page-header">
        <div className="page-header-text">
          <h1 className="page-title">Flashcards</h1>
          <p className="page-subtitle">
            {decodedSubject} · {total - index} card{total - index !== 1 ? "s" : ""} remaining · {total} due today
          </p>
        </div>
      </div>

      <div className="flash-progress-bar">
        <div className="flash-progress-fill" style={{ width: `${progress}%` }} />
      </div>

      <div className="flash-stage">
        <div
          className={`flash-card ${flipped ? "flipped" : ""}`}
          onClick={() => { if (!flipped) setFlipped(true); }}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") setFlipped(true); }}
        >
          <div className="flash-card-inner">
            <div className="flash-card-front">
              {current.subject && <span className="flash-subject">{current.subject}</span>}
              <div className="flash-concept">{current.concept}</div>
              <span className="flash-hint">Click to reveal</span>
            </div>
            <div className="flash-card-back">
              {current.subject && <span className="flash-subject">{current.subject}</span>}
              <div className="flash-concept">{current.concept}</div>
              <div className="flash-summary">{current.summary}</div>
            </div>
          </div>
        </div>

        {flipped && (
          <div className="flash-ratings">
            <p className="flash-ratings-label">How well did you remember this?</p>
            <div className="flash-ratings-row">
              {RATINGS.map(({ label, quality, className }) => (
                <button
                  key={label}
                  className={`flash-rate-btn ${className}`}
                  disabled={submitting}
                  onClick={() => void handleRate(quality)}
                  type="button"
                >
                  <span className="flash-rate-label">{label}</span>
                  <span className="flash-rate-interval">
                    {quality < 3 ? "now" : intervalLabel(
                      quality === 3 ? current.sr_interval :
                      quality === 4 ? (current.sr_repetitions === 0 ? 1 : current.sr_repetitions === 1 ? 6 : Math.round(current.sr_interval * current.sr_ease_factor)) :
                      (current.sr_repetitions === 0 ? 1 : current.sr_repetitions === 1 ? 6 : Math.round(current.sr_interval * Math.min(2.5, current.sr_ease_factor + 0.1)))
                    )}
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="flash-counter">{index + 1} / {total}</div>
    </div>
  );
}
