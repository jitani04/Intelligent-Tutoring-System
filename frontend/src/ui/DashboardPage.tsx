import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";

import { listConversations, listMaterials } from "../api";

const SUBJECT_ICONS: Record<string, string> = {
  biology: "🧬", chemistry: "⚗️", physics: "⚛️", math: "∑",
  history: "📜", english: "📝", computer: "💻", economics: "📈",
  psychology: "🧠", default: "📖",
};

function subjectIcon(subject: string): string {
  const key = subject.toLowerCase();
  for (const [word, icon] of Object.entries(SUBJECT_ICONS)) {
    if (key.includes(word)) return icon;
  }
  return SUBJECT_ICONS.default;
}

function progressFromCount(n: number): number {
  if (n === 0) return 0;
  if (n <= 2) return 20;
  if (n <= 5) return 45;
  if (n <= 10) return 68;
  return 85;
}

export function DashboardPage() {
  const { data: conversations = [] } = useQuery({
    queryKey: ["conversations"],
    queryFn: listConversations,
  });

  const { data: materials = [] } = useQuery({
    queryKey: ["materials"],
    queryFn: listMaterials,
  });

  const projects = (() => {
    const map = new Map<string, { sessions: { id: number; topic: string }[]; lastActive: string }>();
    for (const c of conversations) {
      const subject = c.subject ?? "General";
      const existing = map.get(subject) ?? { sessions: [], lastActive: c.created_at };
      existing.sessions.push({ id: c.id, topic: subject });
      if (c.created_at > existing.lastActive) existing.lastActive = c.created_at;
      map.set(subject, existing);
    }
    return Array.from(map.entries()).map(([subject, { sessions, lastActive }]) => ({
      subject,
      sessions,
      lastActive,
      progress: progressFromCount(sessions.length),
      latestId: Math.max(...sessions.map((s) => s.id)),
      recentTopic: sessions[sessions.length - 1]?.topic,
    }));
  })();

  const subjects = new Set(projects.map((p) => p.subject)).size;

  function formatDate(value: string): string {
    return new Date(value).toLocaleDateString([], { month: "short", day: "numeric" });
  }

  return (
    <div className="dashboard">
      <div className="dashboard-greeting">
        <h1>Dashboard</h1>
        <p>Your study projects and recent activity.</p>
      </div>

      <div className="stats-row">
        <div className="stat-card">
          <div className="stat-card-value">{conversations.length}</div>
          <div className="stat-card-label">Total sessions</div>
        </div>
        <div className="stat-card">
          <div className="stat-card-value">{materials.length}</div>
          <div className="stat-card-label">Uploaded materials</div>
        </div>
        <div className="stat-card">
          <div className="stat-card-value">{subjects}</div>
          <div className="stat-card-label">Subjects studied</div>
        </div>
      </div>

      <div>
        <div className="section-header" style={{ marginBottom: "0.875rem" }}>
          <span className="section-title">Your projects</span>
          <Link to="/start/topic" className="button button-primary" style={{ fontSize: "0.8rem", padding: "0.45rem 0.875rem" }}>
            + New project
          </Link>
        </div>

        {projects.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state-icon">📚</div>
            <h3>No projects yet</h3>
            <p>Start your first tutoring session to create a project. The agent will track your progress over time.</p>
            <Link to="/start/topic" className="button button-primary">Start a session</Link>
          </div>
        ) : (
          <div className="project-grid">
            {projects.map(({ subject, sessions, progress, recentTopic, lastActive }) => (
              <Link key={subject} to={`/projects/${encodeURIComponent(subject)}`} className="project-card">
                <div className="project-card-header">
                  <div className="project-card-icon">{subjectIcon(subject)}</div>
                  <span className="project-card-badge">{Math.round(progress)}% mastery</span>
                </div>
                <div className="project-card-name">{subject}</div>
                {recentTopic && <div className="project-card-topic">{recentTopic}</div>}
                <div className="progress-bar">
                  <div className="progress-fill" style={{ width: `${progress}%` }} />
                </div>
                <div className="project-card-footer">
                  <span className="project-card-sessions">{sessions.length} session{sessions.length !== 1 ? "s" : ""}</span>
                  <span className="project-card-mastery">{formatDate(lastActive)}</span>
                </div>
              </Link>
            ))}

            <Link to="/start/topic" className="project-card project-card-new">
              <div className="project-card-new-icon">+</div>
              <span>New project</span>
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}
