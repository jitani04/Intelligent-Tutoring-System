import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";

import { listConversations } from "../api";
import { getConversationContext, getStoredUserId } from "../studyState";
import type { Conversation } from "../types";

function formatDate(value: string): string {
  return new Date(value).toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function estimateDuration(conversation: Conversation): string {
  const start = new Date(conversation.created_at).getTime();
  const end = new Date(conversation.messages.at(-1)?.created_at ?? conversation.created_at).getTime();
  const minutes = Math.max(1, Math.round((end - start) / 60000));
  return `${minutes} min`;
}

export function HistoryPage() {
  const [userIdInput, setUserIdInput] = useState(() => getStoredUserId());
  const parsedUserId = Number(userIdInput);
  const isValidUserId = Number.isInteger(parsedUserId) && parsedUserId > 0;

  useEffect(() => {
    if (isValidUserId) {
      window.localStorage.setItem("its-user-id", userIdInput);
    }
  }, [isValidUserId, userIdInput]);

  const conversationsQuery = useQuery({
    queryKey: ["conversations", parsedUserId],
    queryFn: () => listConversations(parsedUserId),
    enabled: isValidUserId,
  });

  const groupedSessions = useMemo(() => {
    const groups = new Map<string, Array<Conversation & { topic: string }>>();

    for (const conversation of conversationsQuery.data ?? []) {
      const metadata = getConversationContext(conversation.id);
      const subject = metadata?.subject ?? "Unlabeled";
      const topic = metadata?.topic ?? `Conversation #${conversation.id}`;
      const currentGroup = groups.get(subject) ?? [];
      currentGroup.push({ ...conversation, topic });
      groups.set(subject, currentGroup);
    }

    return Array.from(groups.entries());
  }, [conversationsQuery.data]);

  return (
    <div className="resource-page">
      <header className="resource-header">
        <div>
          <p className="page-kicker">History</p>
          <h1>Session history</h1>
          <p className="resource-copy">
            This page maps to the PRD’s history view: resume past sessions, scan topics, and get a
            lightweight subject summary.
          </p>
        </div>

        <div className="resource-actions">
          <label className="flow-field compact">
            <span>User id</span>
            <input
              min={1}
              onChange={(event) => setUserIdInput(event.target.value)}
              type="number"
              value={userIdInput}
            />
          </label>
          <Link className="button button-secondary" to="/materials">
            Materials
          </Link>
          <Link className="button button-primary" to="/start/topic">
            New session
          </Link>
        </div>
      </header>

      {!isValidUserId ? <p className="error-text">Enter a valid `X-User-Id` to load history.</p> : null}
      {conversationsQuery.isLoading ? <p className="muted">Loading sessions…</p> : null}
      {conversationsQuery.isError ? <p className="error-text">Failed to load sessions.</p> : null}

      <section className="resource-grid">
        <div className="resource-card">
          <p className="rail-card-label">Overview</p>
          <div className="snapshot-grid">
            <div>
              <strong>{conversationsQuery.data?.length ?? 0}</strong>
              <span>saved sessions</span>
            </div>
            <div>
              <strong>{groupedSessions.length}</strong>
              <span>subjects represented</span>
            </div>
          </div>
        </div>
      </section>

      {groupedSessions.length === 0 && !conversationsQuery.isLoading ? (
        <section className="resource-card">
          <p className="muted">No saved sessions yet.</p>
        </section>
      ) : null}

      {groupedSessions.map(([subject, sessions]) => (
        <section className="resource-card" key={subject}>
          <div className="table-header">
            <div>
              <p className="rail-card-label">{subject}</p>
              <h2>{sessions.length} sessions</h2>
            </div>
          </div>

          <div className="resource-list">
            {sessions.map((session) => (
              <article className="resource-item" key={session.id}>
                <div>
                  <strong>{session.topic}</strong>
                  <p>
                    {formatDate(session.created_at)} • {estimateDuration(session)}
                  </p>
                </div>
                <div className="resource-item-actions">
                  <span className="status-pill">{session.messages.length} messages</span>
                  <Link className="button button-secondary" to={`/sessions/${session.id}`}>
                    Resume
                  </Link>
                </div>
              </article>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
