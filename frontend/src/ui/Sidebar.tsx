import { useQuery } from "@tanstack/react-query";
import { Link, useLocation, useNavigate } from "react-router-dom";

import { listConversations } from "../api";
import { clearToken } from "../auth";

function progressFromCount(n: number): number {
  if (n === 0) return 0;
  if (n <= 2) return 20;
  if (n <= 5) return 45;
  if (n <= 10) return 68;
  return 85;
}

export function Sidebar() {
  const location = useLocation();
  const navigate = useNavigate();

  const { data: conversations = [] } = useQuery({
    queryKey: ["conversations"],
    queryFn: listConversations,
  });

  const projects = (() => {
    const map = new Map<string, { count: number; lastId: number }>();
    for (const c of conversations) {
      const subject = c.subject ?? "General";
      const existing = map.get(subject);
      if (!existing || c.id > existing.lastId) {
        map.set(subject, { count: (existing?.count ?? 0) + 1, lastId: c.id });
      } else {
        map.set(subject, { ...existing, count: existing.count + 1 });
      }
    }
    return Array.from(map.entries()).map(([subject, { count, lastId }]) => ({
      subject, count, lastId, progress: progressFromCount(count),
    }));
  })();

  const recentConversations = [...conversations]
    .sort((a, b) => b.id - a.id)
    .slice(0, 8);

  function handleSignOut() {
    clearToken();
    navigate("/");
  }

  const isActive = (path: string) => location.pathname.startsWith(path);

  return (
    <nav className="sidebar">
      <div className="sidebar-brand">
        <div className="sidebar-logo">KP</div>
        <span className="sidebar-name">KnowledgePal</span>
      </div>

      <Link to="/sessions/new" className="sidebar-new-btn">
        <span>+</span>
        <span>New session</span>
      </Link>

      <div className="sidebar-scroll">
        <Link
          to="/dashboard"
          className={`sidebar-item ${location.pathname === "/dashboard" ? "active" : ""}`}
        >
          <em className="sidebar-item-icon">⊞</em>
          <span className="sidebar-item-label">Dashboard</span>
        </Link>

        {projects.length > 0 && (
          <>
            <div className="sidebar-section">Projects</div>
            {projects.map(({ subject, count, progress }) => (
              <Link
                key={subject}
                to={`/projects/${encodeURIComponent(subject)}`}
                className={`sidebar-project ${isActive(`/projects/${encodeURIComponent(subject)}`) ? "active" : ""}`}
              >
                <span className="sidebar-project-name">{subject}</span>
                <div className="sidebar-project-progress">
                  <div className="sidebar-project-fill" style={{ width: `${progress}%` }} />
                </div>
                <span className="sidebar-project-meta">{count} session{count !== 1 ? "s" : ""}</span>
              </Link>
            ))}
          </>
        )}

        {recentConversations.length > 0 && (
          <>
            <div className="sidebar-divider" />
            <div className="sidebar-section">Recent</div>
            {recentConversations.map((c) => {
              const label = c.subject ?? `Session #${c.id}`;
              return (
                <Link
                  key={c.id}
                  to={`/sessions/${c.id}`}
                  className={`sidebar-item ${location.pathname === `/sessions/${c.id}` ? "active" : ""}`}
                >
                  <em className="sidebar-item-icon">◎</em>
                  <span className="sidebar-item-label">{label}</span>
                </Link>
              );
            })}
          </>
        )}

        <div className="sidebar-divider" />

        <Link
          to="/materials"
          className={`sidebar-item ${isActive("/materials") ? "active" : ""}`}
        >
          <em className="sidebar-item-icon">📂</em>
          <span className="sidebar-item-label">Materials</span>
        </Link>

        <Link
          to="/history"
          className={`sidebar-item ${isActive("/history") ? "active" : ""}`}
        >
          <em className="sidebar-item-icon">◷</em>
          <span className="sidebar-item-label">History</span>
        </Link>
      </div>

      <div className="sidebar-footer">
        <button className="sidebar-item" onClick={handleSignOut} type="button" style={{ width: "100%" }}>
          <em className="sidebar-item-icon">↩</em>
          <span className="sidebar-item-label">Sign out</span>
        </button>
      </div>
    </nav>
  );
}
