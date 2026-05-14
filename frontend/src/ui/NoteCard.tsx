import type { KeyIdea } from "../types";

export function isNoteDue(idea: KeyIdea): boolean {
  return new Date(idea.sr_due_date) <= new Date();
}

export function noteReviewLabel(idea: KeyIdea): string {
  if (idea.sr_repetitions === 0) return "Not yet reviewed";
  if (isNoteDue(idea)) return "Due for review";
  const d = new Date(idea.sr_due_date);
  return `Next: ${d.toLocaleDateString([], { month: "short", day: "numeric" })}`;
}

function formatNoteDate(iso: string) {
  return new Date(iso).toLocaleDateString([], { month: "short", day: "numeric", year: "numeric" });
}

export interface NoteCardProps {
  note: KeyIdea;
  deleting: boolean;
  promoting: boolean;
  showSubject?: boolean;
  onDelete: () => void;
  onPromote: () => void;
}

export function NoteCard({ note, deleting, promoting, showSubject = true, onDelete, onPromote }: NoteCardProps) {
  const due = isNoteDue(note);
  const label = noteReviewLabel(note);

  return (
    <div className="note-card">
      <div className="note-card-header">
        {showSubject && note.subject && <span className="note-subject-tag">{note.subject}</span>}
        <button
          aria-label="Delete note"
          className="note-delete-btn"
          disabled={deleting}
          onClick={onDelete}
          title="Delete"
          type="button"
        >
          {deleting ? "…" : "✕"}
        </button>
      </div>

      <div className="note-concept">{note.concept}</div>
      <div className="note-summary">{note.summary}</div>

      <div className="note-card-footer">
        <span className="note-date">{formatNoteDate(note.created_at)}</span>
        <div className="note-review-status">
          <span className={`note-review-label ${due ? "note-review-label-due" : ""}`}>{label}</span>
          {!due && (
            <button
              className="note-promote-btn"
              disabled={promoting}
              onClick={onPromote}
              title="Schedule for review today"
              type="button"
            >
              {promoting ? "…" : "Review now"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
