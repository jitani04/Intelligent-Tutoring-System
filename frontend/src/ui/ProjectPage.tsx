import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate, useParams } from "react-router-dom";

import { createConversation, getProjectProfile, listConversations } from "../api";
import type { Conversation } from "../types";

function formatDate(value: string): string {
  return new Date(value).toLocaleDateString([], { month: "short", day: "numeric", year: "numeric" });
}

function duration(c: Conversation): string {
  const msgs = c.messages;
  if (msgs.length < 2) return "—";
  const mins = Math.max(1, Math.round(
    (new Date(msgs[msgs.length - 1].created_at).getTime() - new Date(msgs[0].created_at).getTime()) / 60000
  ));
  return `${mins} min`;
}

const LEVEL_LABELS: Record<string, string> = {
  beginner: "Beginner",
  some: "Some experience",
  intermediate: "Intermediate",
  advanced: "Advanced",
};

export function ProjectPage() {
  const { subject } = useParams<{ subject: string }>();
  const decoded = decodeURIComponent(subject ?? "");
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const { data: conversations = [] } = useQuery({
    queryKey: ["conversations"],
    queryFn: listConversations,
  });

  const { data: profile } = useQuery({
    queryKey: ["project-profile", decoded],
    queryFn: () => getProjectProfile(decoded),
  });

  const sessions = conversations
    .filter((c) => c.subject === decoded)
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

  const newSessionMutation = useMutation({
    mutationFn: () => createConversation(decoded),
    onSuccess: async (c) => {
      await queryClient.invalidateQueries({ queryKey: ["conversations"] });
      navigate(`/sessions/${c.id}`);
    },
  });

  const totalMessages = sessions.reduce((sum, c) => sum + c.messages.length, 0);

  const sessionsSorted = [...sessions].reverse(); // oldest first for trend chart
  const maxMessages = Math.max(...sessionsSorted.map((c) => c.messages.length), 1);

  return (
    <div className="page-shell">
      <div className="page-header">
        <div className="page-header-text">
          <h1 className="page-title">{decoded}</h1>
          <p className="page-subtitle">
            {profile?.level ? LEVEL_LABELS[profile.level] ?? profile.level : null}
            {profile?.level && " · "}
            {sessions.length} session{sessions.length !== 1 ? "s" : ""} · {totalMessages} messages
          </p>
        </div>
        <div style={{ display: "flex", gap: "0.5rem" }}>
          <Link
            to={`/projects/${encodeURIComponent(decoded)}/setup`}
            className="button button-secondary"
            style={{ fontSize: "0.8rem", padding: "0.45rem 0.875rem" }}
          >
            Edit profile
          </Link>
          <button
            className="button button-primary"
            disabled={newSessionMutation.isPending}
            onClick={() => newSessionMutation.mutate()}
            type="button"
          >
            {newSessionMutation.isPending ? "Creating…" : "+ New session"}
          </button>
        </div>
      </div>

      {profile?.goals && (
        <div className="project-goals">
          <span className="project-goals-label">Goals</span>
          <span className="project-goals-text">{profile.goals}</span>
        </div>
      )}

      <div className="project-two-col">

        {/* Mind map */}
        <div className="content-card">
          <div className="content-card-title">
            Learning map
            {!profile?.mind_map && (
              <Link
                to={`/projects/${encodeURIComponent(decoded)}/setup`}
                className="content-card-action"
              >
                Generate
              </Link>
            )}
          </div>
          {profile?.mind_map ? (
            <div className="mindmap">
              <div className="mindmap-root">{profile.mind_map.subject}</div>
              <div className="mindmap-nodes">
                {profile.mind_map.nodes.map((node) => (
                  <div key={node.topic} className="mindmap-node">
                    <div className="mindmap-node-title">{node.topic}</div>
                    <div className="mindmap-subtopics">
                      {node.subtopics.map((sub) => (
                        <span key={sub} className="mindmap-subtopic">{sub}</span>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <p className="muted" style={{ fontSize: "0.875rem" }}>
              Complete the project setup to generate a learning map.
            </p>
          )}
        </div>

        {/* Learning trends */}
        <div className="content-card">
          <div className="content-card-title">Activity</div>
          {sessionsSorted.length === 0 ? (
            <p className="muted" style={{ fontSize: "0.875rem" }}>No sessions yet.</p>
          ) : (
            <div className="trend-chart">
              {sessionsSorted.map((c, i) => {
                const pct = Math.max(4, Math.round((c.messages.length / maxMessages) * 100));
                return (
                  <Link key={c.id} to={`/sessions/${c.id}`} className="trend-bar-wrap">
                    <div className="trend-bar" style={{ height: `${pct}%` }} />
                    <div className="trend-bar-label">S{i + 1}</div>
                    <div className="trend-bar-tooltip">
                      {formatDate(c.created_at)}<br />
                      {c.messages.length} messages
                    </div>
                  </Link>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Sessions list */}
      <div className="content-card-title" style={{ marginBottom: "0.75rem" }}>Sessions</div>
      {sessions.length === 0 ? (
        <div className="empty-state">
          <div className="empty-state-icon">💬</div>
          <h3>No sessions yet</h3>
          <p>Start your first session for this project.</p>
          <button className="button button-primary" onClick={() => newSessionMutation.mutate()} type="button">
            Start session
          </button>
        </div>
      ) : (
        <div className="content-card" style={{ padding: 0, overflow: "hidden" }}>
          {sessions.map((c, i) => (
            <div key={c.id} className="project-session-row" style={{ borderTop: i === 0 ? "none" : undefined }}>
              <div className="project-session-info">
                <div className="project-session-num">Session {sessions.length - i}</div>
                <div className="project-session-meta">
                  {formatDate(c.created_at)}
                  {c.messages.length > 0 && <> · {c.messages.length} messages · {duration(c)}</>}
                  {c.messages.length === 0 && <> · No messages yet</>}
                </div>
              </div>
              <Link className="button button-secondary" to={`/sessions/${c.id}`} style={{ fontSize: "0.8rem", padding: "0.4rem 0.8rem" }}>
                {c.messages.length === 0 ? "Open" : "Resume"}
              </Link>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
