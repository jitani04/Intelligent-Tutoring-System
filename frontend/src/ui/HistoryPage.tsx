import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { Link } from "react-router-dom";

import { listConversations } from "../api";
import type { Conversation } from "../types";

function formatDate(value: string): string {
  return new Date(value).toLocaleDateString([], { month: "short", day: "numeric", year: "numeric" });
}

function duration(c: Conversation): string {
  const start = new Date(c.created_at).getTime();
  const end = new Date(c.messages.at(-1)?.created_at ?? c.created_at).getTime();
  const mins = Math.max(1, Math.round((end - start) / 60000));
  return `${mins} min`;
}

export function HistoryPage() {
  const { data: conversations = [], isLoading, isError } = useQuery({
    queryKey: ["conversations"],
    queryFn: listConversations,
  });

  const groups = useMemo(() => {
    const map = new Map<string, Conversation[]>();
    for (const c of conversations) {
      const subject = c.subject ?? "Unlabeled";
      const group = map.get(subject) ?? [];
      group.push(c);
      map.set(subject, group);
    }
    return Array.from(map.entries());
  }, [conversations]);

  return (
    <div className="page-shell">
      <div className="page-header">
        <div className="page-header-text">
          <h1 className="page-title">History</h1>
          <p className="page-subtitle">All past sessions, grouped by subject.</p>
        </div>
        <Link to="/sessions/new" className="button button-primary">New session</Link>
      </div>

      <div className="two-col" style={{ gridTemplateColumns: "repeat(3, 1fr)" }}>
        <div className="snap-cell content-card">
          <strong style={{ fontSize: "1.75rem", fontFamily: "Newsreader, serif" }}>{conversations.length}</strong>
          <span className="muted" style={{ fontSize: "0.78rem" }}>total sessions</span>
        </div>
        <div className="snap-cell content-card">
          <strong style={{ fontSize: "1.75rem", fontFamily: "Newsreader, serif" }}>{groups.length}</strong>
          <span className="muted" style={{ fontSize: "0.78rem" }}>subjects</span>
        </div>
        <div className="snap-cell content-card">
          <strong style={{ fontSize: "1.75rem", fontFamily: "Newsreader, serif" }}>
            {conversations.reduce((acc, c) => acc + c.messages.length, 0)}
          </strong>
          <span className="muted" style={{ fontSize: "0.78rem" }}>total messages</span>
        </div>
      </div>

      {isLoading ? <p className="muted">Loading…</p> : null}
      {isError ? <p className="error-text">Failed to load sessions.</p> : null}

      {groups.length === 0 && !isLoading ? (
        <div className="empty-state">
          <div className="empty-state-icon">◷</div>
          <h3>No sessions yet</h3>
          <p>Your past tutoring sessions will appear here.</p>
          <Link to="/sessions/new" className="button button-primary">Start a session</Link>
        </div>
      ) : null}

      {groups.map(([subject, sessions]) => (
        <div key={subject} className="content-card">
          <div className="content-card-title">{subject} · {sessions.length} session{sessions.length !== 1 ? "s" : ""}</div>
          <div className="history-list">
            {sessions.map((s) => (
              <div key={s.id} className="history-item">
                <div className="history-item-info">
                  <div className="history-item-name">{s.subject ?? `Session #${s.id}`}</div>
                  <div className="history-item-meta">
                    {formatDate(s.created_at)} · {s.messages.length} messages · {duration(s)}
                  </div>
                </div>
                <div className="history-item-actions">
                  <span className="pill pill-blue">{s.messages.length} msg</span>
                  <Link className="button button-secondary" to={`/sessions/${s.id}`}
                    style={{ fontSize: "0.78rem", padding: "0.35rem 0.75rem" }}>
                    Resume
                  </Link>
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
