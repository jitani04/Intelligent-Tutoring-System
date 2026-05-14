import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { StickyNote } from "lucide-react";

import { deleteKeyIdea, listAllKeyIdeas, promoteKeyIdea } from "../api";
import { NoteCard } from "./NoteCard";

export function NotesPage() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [activeSubject, setActiveSubject] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [promotingId, setPromotingId] = useState<number | null>(null);

  const { data: allNotes = [], isLoading } = useQuery({
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

      {isLoading && <p className="muted" style={{ marginTop: "2rem" }}>Loading notes…</p>}

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
