import { useState, useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, Navigate, useNavigate, useParams } from "react-router-dom";
import { CheckCircle2, ChevronLeft, ChevronRight, Trash2, Shuffle } from "lucide-react";
import { createConversation, deleteFlashcard, getSmartFlashcardSession, reviewFlashcard } from "../api";
import type { Flashcard } from "../types";
import { buttonClass } from "./buttonClass";
import Loading from "./Loading";
import ErrorMessage from "./ErrorMessage";

const RATINGS: { label: string; quality: number; className: string; hint: string }[] = [
  { label: "Forgot",  quality: 1, className: "flash-btn-again", hint: "Show this again soon" },
  { label: "Sort of", quality: 3, className: "flash-btn-hard",  hint: "Review sooner" },
  { label: "Knew it", quality: 5, className: "flash-btn-easy",  hint: "Push it further out" },
];

function intervalLabel(days: number): string {
  if (days <= 0) return "later today";
  if (days === 1) return "tomorrow";
  if (days < 7) return `in ${days} days`;
  if (days < 30) {
    const weeks = Math.round(days / 7);
    return `in ${weeks} week${weeks !== 1 ? "s" : ""}`;
  }
  const months = Math.round(days / 30);
  return `in ${months} month${months !== 1 ? "s" : ""}`;
}

function flashcardFront(card: Flashcard): string {
  const raw = card.concept.trim();
  const separators = [":", " - ", " — ", " – "];
  for (const separator of separators) {
    if (!raw.includes(separator)) continue;
    const [front, rest] = raw.split(separator, 2);
    if (front.trim() && rest.trim().length >= 16) {
      return front.trim();
    }
  }
  return raw;
}

function flashcardBack(card: Flashcard): string {
  const front = flashcardFront(card);
  let back = card.summary.trim();
  const escapedFront = front.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  back = back.replace(new RegExp(`^${escapedFront}\\s*(?:\\([^)]*\\))?\\s*[:\\-–—]?\\s*`, "i"), "").trim();
  return back || card.summary.trim();
}

export function FlashcardsView({ subject }: { subject: string }) {
  const decodedSubject = subject;
  const encodedSubject = encodeURIComponent(decodedSubject);
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [index, setIndex] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [sessionDone, setSessionDone] = useState<{ reviewed: number } | null>(null);
  const [reviewed, setReviewed] = useState(0);
  const [deletedIds, setDeletedIds] = useState<Set<number>>(new Set());
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [order, setOrder] = useState<number[]>([]);

  const { data, isLoading, isError } = useQuery({
    queryKey: ["flashcards-due", decodedSubject],
    queryFn: () => getSmartFlashcardSession(decodedSubject),
    enabled: Boolean(decodedSubject),
    staleTime: 0,
  });

  const weakAreas: string[] = data?.weak_areas ?? [];

  const newSessionMutation = useMutation({
    mutationFn: () => createConversation(decodedSubject),
    onSuccess: (conversation) => {
      navigate(`/sessions/${conversation.id}`);
    },
  });

  const cards: Flashcard[] = (data?.cards ?? []).filter((c) => !deletedIds.has(c.id));
  const total = cards.length;
  useEffect(() => {
    setOrder((prev) => {
      // reset order when total changes; keep previous order if lengths match
      if (prev.length === total && total > 0) return prev;
      return [...Array(total).keys()];
    });
    setIndex(0);
    setFlipped(false);
  }, [total]);

  const current = order.length > 0 ? (cards[order[index]] ?? null) : null;
  const currentFront = current ? flashcardFront(current) : "";
  const currentBack = current ? flashcardBack(current) : "";

  async function handleRate(quality: number) {
    if (!current || submitting) return;
    setSubmitting(true);
    try {
      await reviewFlashcard(current.id, quality);
      const nextReviewed = reviewed + 1;
      setReviewed(nextReviewed);

      if (index + 1 >= order.length) {
        setSessionDone({ reviewed: nextReviewed });
        void queryClient.invalidateQueries({ queryKey: ["flashcards-due", decodedSubject] });
      } else {
          setIndex((i) => Math.min(order.length - 1, i + 1));
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
    setDeletedIds(new Set());
    setOrder((_) => [...Array(cards.length).keys()]);
    void queryClient.invalidateQueries({ queryKey: ["flashcards-due", decodedSubject] });
  }

  function shuffleDeck() {
    if (total <= 1) return;
    const shuffled = [...Array(total).keys()];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    setOrder(shuffled);
    setIndex(0);
    setFlipped(false);
  }

  async function handleDelete() {
    if (!current || submitting) return;
    setSubmitting(true);
    try {
      await deleteFlashcard(current.id);
      const newTotal = total - 1;
      setDeletedIds((prev) => new Set([...prev, current.id]));
      setConfirmDelete(false);
      setFlipped(false);
      if (newTotal === 0) {
        setSessionDone({ reviewed });
      } else if (index >= newTotal) {
        setIndex(newTotal - 1);
      }
      void queryClient.invalidateQueries({ queryKey: ["flashcards-due", decodedSubject] });
    } finally {
      setSubmitting(false);
    }
  }

  if (isLoading) {
    return <Loading title="Loading flashcards…" subtitle="Fetching due cards" />;
  }

  if (isError) {
    return <ErrorMessage message={"Failed to load flashcards."} />;
  }

  if (sessionDone || total === 0) {
    return (
      <div className="flash-done" style={{ marginTop: "1rem" }}>
        <div className="flash-done-icon"><CheckCircle2 size={28} strokeWidth={1.6} /></div>
        <h2>All caught up!</h2>
        {sessionDone && sessionDone.reviewed > 0 ? (
          <p>You reviewed {sessionDone.reviewed} card{sessionDone.reviewed !== 1 ? "s" : ""} this study session.</p>
        ) : (
          <p>No {decodedSubject} cards are due right now. Keep studying to build your deck.</p>
        )}
        <div className="flash-done-actions">
          {sessionDone && (
            <button className={buttonClass("secondary")} onClick={handleRestart} type="button">
              Check for more
            </button>
          )}
          <Link className={buttonClass("secondary")} to={`/projects/${encodedSubject}`}>Open subject</Link>
          <button
            className={buttonClass("primary")}
            disabled={newSessionMutation.isPending}
            onClick={() => newSessionMutation.mutate()}
            type="button"
          >
            {newSessionMutation.isPending ? "Creating…" : "Start a study session"}
          </button>
        </div>
      </div>
    );
  }

  if (!current) return null;

  const progress = (index / total) * 100;

  return (
    <>
      <div className="flash-progress-bar">
        <div className="flash-progress-fill" style={{ width: `${progress}%` }} />
      </div>

      {weakAreas.length > 0 && (
        <div className="flash-context-strip">
          <span className="flash-context-label">Targeting weak areas:</span>
          {weakAreas.slice(0, 4).map((area) => (
            <span key={area} className="flash-context-chip">{area}</span>
          ))}
          {weakAreas.length > 4 && <span className="flash-context-more">+{weakAreas.length - 4} more</span>}
        </div>
      )}

      <div className="flash-stage">
        <div
          className={`flash-card ${flipped ? "flipped" : ""}`}
          onClick={() => setFlipped((f) => !f)}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") setFlipped((f) => !f); }}
        >
          <div className="flash-card-inner">
            <div className="flash-card-front">
              {current.subject && <span className="flash-subject">{current.subject}</span>}
              <div className="flash-concept">{currentFront}</div>
              <span className="flash-hint">Click to reveal</span>
            </div>
            <div className="flash-card-back">
              {current.subject && <span className="flash-subject">{current.subject}</span>}
              <div className="flash-summary">{currentBack}</div>
            </div>
          </div>
        </div>

        {flipped && (
          <div className="flash-ratings">
            <p className="flash-ratings-label">Did you remember it?</p>
            <div className="flash-ratings-row">
              {RATINGS.map(({ label, quality, className, hint }) => {
                const nextDays =
                  quality < 3
                    ? 0
                    : quality === 3
                      ? Math.max(1, current.sr_interval)
                      : current.sr_repetitions === 0
                        ? 1
                        : current.sr_repetitions === 1
                          ? 6
                          : Math.round(current.sr_interval * Math.min(2.5, current.sr_ease_factor + 0.1));
                return (
                  <button
                    key={label}
                    className={`flash-rate-btn ${className}`}
                    disabled={submitting}
                    onClick={() => void handleRate(quality)}
                    title={hint}
                    type="button"
                  >
                    <span className="flash-rate-label">{label}</span>
                    <span className="flash-rate-interval">{intervalLabel(nextDays)}</span>
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>

      <div className="flash-nav">
        <button
          aria-label="Previous card"
          className="flash-nav-btn"
          disabled={index === 0 || submitting}
          onClick={() => {
            setIndex((i) => Math.max(0, i - 1));
            setFlipped(false);
          }}
          type="button"
        >
          <ChevronLeft size={18} strokeWidth={2} />
        </button>
        <div className="flash-counter">{index + 1} / {total}</div>
        <button
          aria-label="Shuffle cards"
          className="flash-nav-btn"
          disabled={submitting || total <= 1}
          onClick={() => shuffleDeck()}
          title="Shuffle deck"
          type="button"
        >
          <Shuffle size={16} strokeWidth={2} />
        </button>
        <button
          aria-label="Next card"
          className="flash-nav-btn"
          disabled={index >= order.length - 1 || submitting}
          onClick={() => {
            setIndex((i) => Math.min(order.length - 1, i + 1));
            setFlipped(false);
          }}
          type="button"
        >
          <ChevronRight size={18} strokeWidth={2} />
        </button>
      </div>

      <div className="flash-delete-row">
        {confirmDelete ? (
          <>
            <span className="flash-delete-label">Remove this card?</span>
            <button
              className="flash-delete-confirm"
              disabled={submitting}
              onClick={() => void handleDelete()}
              type="button"
            >
              Remove
            </button>
            <button
              className="flash-delete-cancel"
              onClick={() => setConfirmDelete(false)}
              type="button"
            >
              Cancel
            </button>
          </>
        ) : (
          <button
            className="flash-delete-trigger"
            disabled={submitting}
            onClick={() => setConfirmDelete(true)}
            title="Delete this card"
            type="button"
          >
            <Trash2 size={13} strokeWidth={1.8} />
            Delete card
          </button>
        )}
      </div>
    </>
  );
}

export function FlashcardsPage() {
  const { subject } = useParams<{ subject: string }>();
  const decodedSubject = decodeURIComponent(subject ?? "");
  if (!decodedSubject) {
    return <Navigate replace to="/dashboard" />;
  }
  return <Navigate replace to={`/projects/${encodeURIComponent(decodedSubject)}?tab=flashcards`} />;
}
