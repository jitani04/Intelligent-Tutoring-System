import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Download, StickyNote } from "lucide-react";

import { deleteKeyIdea, listAllKeyIdeas, promoteKeyIdea } from "../api";
import type { KeyIdea } from "../types";
import { NoteCard } from "./NoteCard";
import Loading from "./Loading";
import ErrorMessage from "./ErrorMessage";

function downloadNotesAsPdf(notes: KeyIdea[], subject: string | null) {
  const title = subject ? `${subject} — Notes` : "All Notes";
  const noteRows = notes
    .map(
      (n) => `
    <div class="note">
      ${n.subject ? `<div class="subject">${n.subject}</div>` : ""}
      <h2>${n.concept}</h2>
      <p>${n.summary}</p>
      <div class="date">${new Date(n.created_at).toLocaleDateString()}</div>
    </div>`,
    )
    .join("\n");
  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"/>
<title>${title}</title>
<style>
  body{font-family:system-ui,sans-serif;max-width:680px;margin:2.5rem auto;color:#111;line-height:1.5}
  h1{font-size:1.35rem;margin-bottom:.2rem}
  .meta{color:#666;font-size:.8rem;margin-bottom:2rem}
  .note{page-break-inside:avoid;margin-bottom:1.6rem;padding:1rem 1rem 1rem 1.1rem;border-left:3px solid #7393b3;border-radius:0 6px 6px 0;background:#f8fafd}
  .note h2{font-size:.92rem;font-weight:700;margin:0 0 .35rem}
  .note p{font-size:.85rem;color:#333;margin:0 0 .5rem;white-space:pre-wrap}
  .subject{font-size:.68rem;color:#7393b3;font-weight:700;letter-spacing:.04em;text-transform:uppercase;margin-bottom:.25rem}
  .date{font-size:.68rem;color:#999}
  @media print{body{margin:1.5rem}}
</style></head><body>
<h1>${title}</h1>
<p class="meta">${notes.length} note${notes.length !== 1 ? "s" : ""} · Exported ${new Date().toLocaleDateString()}</p>
${noteRows}
<script>window.onload=function(){window.print()}<\/script>
</body></html>`;
  const w = window.open("", "_blank");
  if (!w) return;
  w.document.open();
  w.document.write(html);
  w.document.close();
}

export function NotesPage() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [activeSubject, setActiveSubject] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [promotingId, setPromotingId] = useState<number | null>(null);

  const { data: allNotes = [], isLoading, isError } = useQuery({
    queryKey: ["key-ideas-all"],
    queryFn: () => listAllKeyIdeas(),
    staleTime: 30_000,
  });

  const subjects = useMemo(() => {
    const set = new Set<string>();
    for (const n of allNotes) {
      if (n.subject) set.add(n.subject);
    }
    return Array.from(set).sort();
  }, [allNotes]);

  const filtered = useMemo(() => {
    let list = allNotes;
    if (activeSubject) list = list.filter((n) => n.subject === activeSubject);
    const q = search.trim().toLowerCase();
    if (q) list = list.filter((n) => n.concept.toLowerCase().includes(q) || n.summary.toLowerCase().includes(q));
    return list;
  }, [allNotes, activeSubject, search]);

  async function handleDelete(id: number) {
    setDeletingId(id);
    try {
      await deleteKeyIdea(id);
      await queryClient.invalidateQueries({ queryKey: ["key-ideas-all"] });
    } finally {
      setDeletingId(null);
    }
  }

  async function handlePromote(id: number) {
    setPromotingId(id);
    try {
      await promoteKeyIdea(id);
      await queryClient.invalidateQueries({ queryKey: ["key-ideas-all"] });
    } finally {
      setPromotingId(null);
    }
  }

  return (
    <div className="page-shell">
      <div className="page-header">
        <div className="page-header-text">
          <h1 className="page-title">Notes</h1>
          <p className="page-subtitle">
            {allNotes.length} saved idea{allNotes.length !== 1 ? "s" : ""}
            {activeSubject ? ` · ${activeSubject}` : ""}
          </p>
        </div>
        {filtered.length > 0 && (
          <button
            className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--panel-border)] bg-transparent px-3 py-1.5 text-[0.8rem] font-medium text-[var(--text-soft)] transition-colors hover:border-[var(--accent)] hover:text-[var(--accent)]"
            onClick={() => downloadNotesAsPdf(filtered, activeSubject)}
            title="Download notes as PDF"
            type="button"
          >
            <Download size={14} strokeWidth={2} />
            Download PDF
          </button>
        )}
      </div>

      <div className="notes-controls">
        <div className="notes-search-wrap">
          <svg fill="none" height="15" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" viewBox="0 0 24 24" width="15" className="notes-search-icon">
            <circle cx="11" cy="11" r="8" /><path d="M21 21l-4.35-4.35" />
          </svg>
          <input
            className="notes-search"
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Filter notes…"
            type="search"
            value={search}
          />
        </div>

        {subjects.length > 0 && (
          <div className="notes-subjects">
            <button
              className={`notes-subject-pill ${activeSubject === null ? "active" : ""}`}
              onClick={() => setActiveSubject(null)}
              type="button"
            >
              All
            </button>
            {subjects.map((s) => (
              <button
                key={s}
                className={`notes-subject-pill ${activeSubject === s ? "active" : ""}`}
                onClick={() => setActiveSubject(activeSubject === s ? null : s)}
                type="button"
              >
                {s}
              </button>
            ))}
          </div>
        )}
      </div>

      {isLoading && <Loading title="Loading notes…" />}
      {isError && <ErrorMessage message={"Failed to load notes."} />}

      {!isLoading && filtered.length === 0 && (
        <div className="empty-state" style={{ marginTop: "2rem" }}>
          <div className="empty-state-icon"><StickyNote size={26} strokeWidth={1.6} /></div>
          <h3>{allNotes.length === 0 ? "No notes yet" : "No matching notes"}</h3>
          <p>
            {allNotes.length === 0
              ? "Key ideas from your sessions will collect here."
              : "Try a different search or subject filter."}
          </p>
        </div>
      )}

      {filtered.length > 0 && (
        <div className="notes-grid">
          {filtered.map((note) => (
            <NoteCard
              key={note.id}
              note={note}
              deleting={deletingId === note.id}
              promoting={promotingId === note.id}
              onDelete={() => void handleDelete(note.id)}
              onPromote={() => void handlePromote(note.id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
