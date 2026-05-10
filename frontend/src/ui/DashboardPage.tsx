import type { CSSProperties } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";

import { getCurrentUser, listConversations, listProjectProfiles } from "../api";
import { normalizeSubject } from "../subjects";
import type { Conversation } from "../types";

const SUBJECT_ICONS: Record<string, string> = {
  biology: "🧬", chemistry: "⚗️", physics: "⚛️", math: "∑",
  history: "📜", english: "📝", computer: "💻", economics: "📈",
  psychology: "🧠", default: "📖",
};

type SubjectTheme = {
  image: string;
  label: string;
  icon: string;
  gradient: string;
};

const SUBJECT_THEMES: Array<{ match: string[]; theme: SubjectTheme }> = [
  {
    match: ["biology", "anatomy", "botany", "zoology"],
    theme: {
      image: "https://images.unsplash.com/photo-1532187643603-ba119ca4109e?auto=format&fit=crop&w=1200&q=80",
      label: "Life systems",
      icon: "◌",
      gradient: "linear-gradient(135deg, rgba(55, 118, 78, 0.78), rgba(24, 45, 31, 0.28))",
    },
  },
  {
    match: ["chemistry", "organic", "biochem"],
    theme: {
      image: "https://images.unsplash.com/photo-1532094349884-543bc11b234d?auto=format&fit=crop&w=1200&q=80",
      label: "Lab concepts",
      icon: "△",
      gradient: "linear-gradient(135deg, rgba(66, 96, 145, 0.8), rgba(30, 42, 67, 0.3))",
    },
  },
  {
    match: ["physics", "mechanics", "thermo", "electric"],
    theme: {
      image: "https://images.unsplash.com/photo-1636466497217-26a8cbeaf0aa?auto=format&fit=crop&w=1200&q=80",
      label: "Core principles",
      icon: "✦",
      gradient: "linear-gradient(135deg, rgba(84, 93, 152, 0.78), rgba(26, 28, 49, 0.32))",
    },
  },
  {
    match: ["math", "algebra", "geometry", "calculus", "statistics"],
    theme: {
      image: "https://images.unsplash.com/photo-1509228468518-180dd4864904?auto=format&fit=crop&w=1200&q=80",
      label: "Problem sets",
      icon: "∞",
      gradient: "linear-gradient(135deg, rgba(128, 102, 45, 0.78), rgba(47, 34, 14, 0.28))",
    },
  },
  {
    match: ["history", "government", "politics", "geography"],
    theme: {
      image: "https://images.unsplash.com/photo-1461360370896-922624d12aa1?auto=format&fit=crop&w=1200&q=80",
      label: "Context and causes",
      icon: "◆",
      gradient: "linear-gradient(135deg, rgba(119, 74, 52, 0.82), rgba(44, 25, 15, 0.28))",
    },
  },
  {
    match: ["english", "writing", "literature", "reading"],
    theme: {
      image: "https://images.unsplash.com/photo-1455390582262-044cdead277a?auto=format&fit=crop&w=1200&q=80",
      label: "Reading flow",
      icon: "✎",
      gradient: "linear-gradient(135deg, rgba(122, 69, 102, 0.78), rgba(48, 24, 39, 0.28))",
    },
  },
  {
    match: ["computer", "coding", "programming", "software"],
    theme: {
      image: "https://images.unsplash.com/photo-1515879218367-8466d910aaa4?auto=format&fit=crop&w=1200&q=80",
      label: "Build and debug",
      icon: "⌘",
      gradient: "linear-gradient(135deg, rgba(45, 113, 120, 0.82), rgba(14, 43, 46, 0.28))",
    },
  },
  {
    match: ["economics", "finance", "accounting", "business"],
    theme: {
      image: "https://images.unsplash.com/photo-1520607162513-77705c0f0d4a?auto=format&fit=crop&w=1200&q=80",
      label: "Models and markets",
      icon: "↗",
      gradient: "linear-gradient(135deg, rgba(43, 117, 94, 0.8), rgba(13, 40, 33, 0.3))",
    },
  },
  {
    match: ["psychology", "sociology"],
    theme: {
      image: "https://images.unsplash.com/photo-1507413245164-6160d8298b31?auto=format&fit=crop&w=1200&q=80",
      label: "Behavior patterns",
      icon: "◔",
      gradient: "linear-gradient(135deg, rgba(95, 82, 152, 0.78), rgba(29, 22, 57, 0.28))",
    },
  },
];

const DEFAULT_THEME: SubjectTheme = {
  image: "https://images.unsplash.com/photo-1513258496099-48168024aec0?auto=format&fit=crop&w=1200&q=80",
  label: "Study flow",
  icon: "◎",
  gradient: "linear-gradient(135deg, rgba(82, 110, 144, 0.8), rgba(25, 37, 54, 0.3))",
};

function subjectIcon(subject: string): string {
  const key = subject.toLowerCase();
  for (const [word, icon] of Object.entries(SUBJECT_ICONS)) {
    if (key.includes(word)) return icon;
  }
  return SUBJECT_ICONS.default;
}

function subjectTheme(subject: string): SubjectTheme {
  const key = subject.toLowerCase();
  for (const { match, theme } of SUBJECT_THEMES) {
    if (match.some((word) => key.includes(word))) return theme;
  }
  return DEFAULT_THEME;
}

function timeOfDayGreeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}

function formatDate(value: string): string {
  return new Date(value).toLocaleDateString([], { month: "short", day: "numeric" });
}

function projectFocusText(nextReview: string[], sessionsCount: number, progress: number): string {
  if (nextReview.length > 0) {
    const focus = nextReview.slice(0, 2).join(", ");
    return `Review next: ${focus}${nextReview.length > 2 ? "..." : ""}`;
  }
  if (progress >= 70) return "Strong recent momentum across your study sessions.";
  if (sessionsCount <= 1) return "Your first study session is ready for a follow-up.";
  return "Keep building consistency with another guided study session.";
}

function deriveProgress(convs: Conversation[]): {
  progress: number;
  badge: string;
  tooltip: string;
  nextReview: string[];
} {
  const covered = new Set<string>();
  const struggled = new Set<string>();
  let nextReview: string[] = [];
  let latestSummaryAt = "";

  for (const c of convs) {
    if (!c.summary) continue;
    c.summary.covered.forEach((t) => covered.add(t));
    c.summary.struggled_with.forEach((t) => struggled.add(t));
    if (c.created_at > latestSummaryAt) {
      latestSummaryAt = c.created_at;
      nextReview = c.summary.next_review;
    }
  }

  const hasSummary = covered.size > 0 || struggled.size > 0;

  if (!hasSummary) {
    const n = convs.length;
    const progress = n === 0 ? 0 : n <= 2 ? 20 : n <= 5 ? 45 : n <= 10 ? 68 : 85;
    return { progress, badge: `${n} study session${n !== 1 ? "s" : ""}`, tooltip: "Complete a study session to see real progress", nextReview: [] };
  }

  const knownTotal = covered.size + nextReview.length;
  const progress = knownTotal > 0 ? Math.min(94, Math.round((covered.size / knownTotal) * 100)) : 30;
  const weakCount = struggled.size;
  const badge = `${covered.size} topic${covered.size !== 1 ? "s" : ""} covered`;
  const tooltip = [
    `${covered.size} topic${covered.size !== 1 ? "s" : ""} covered`,
    weakCount > 0 ? `${weakCount} area${weakCount !== 1 ? "s" : ""} to strengthen` : null,
    nextReview.length > 0 ? `${nextReview.length} topic${nextReview.length !== 1 ? "s" : ""} to review` : null,
  ].filter(Boolean).join(" · ");

  return { progress, badge, tooltip, nextReview };
}

export function DashboardPage() {
  const { data: user } = useQuery({
    queryKey: ["me"],
    queryFn: getCurrentUser,
  });

  const { data: conversations = [] } = useQuery({
    queryKey: ["conversations"],
    queryFn: listConversations,
  });

  const { data: projectProfiles = [] } = useQuery({
    queryKey: ["project-profiles"],
    queryFn: listProjectProfiles,
  });

  const projectProfileBySubject = new Map(projectProfiles.map((profile) => [normalizeSubject(profile.subject), profile]));

  const projects = (() => {
    const map = new Map<string, { convs: Conversation[]; lastActive: string }>();
    for (const c of conversations) {
      const subject = (c.subject?.trim() || "General");
      const subjectKey = normalizeSubject(subject);
      const existing = map.get(subjectKey) ?? { convs: [], lastActive: c.created_at };
      existing.convs.push(c);
      if (c.created_at > existing.lastActive) existing.lastActive = c.created_at;
      map.set(subjectKey, existing);
    }
    return Array.from(map.entries()).map(([subjectKey, { convs, lastActive }]) => {
      const subject = convs.find((conversation) => conversation.subject?.trim())?.subject?.trim() ?? "General";
      const { progress, badge, tooltip, nextReview } = deriveProgress(convs);
      return {
        subject,
        sessions: convs,
        lastActive,
        progress,
        badge,
        tooltip,
        nextReview,
        theme: subjectTheme(subject),
        coverImageUrl: projectProfileBySubject.get(subjectKey)?.cover_image_url ?? null,
      };
    }).sort((a, b) => b.lastActive.localeCompare(a.lastActive));
  })();

  const displayName = user?.name?.trim() || user?.email.split("@")[0] || "there";
  const firstName = displayName.split(/\s+/)[0];

  return (
    <div className="dashboard">
      <div className="dashboard-hero">
        <h1 className="dashboard-greeting">{timeOfDayGreeting()}, {firstName}.</h1>
      </div>

      <div className="dashboard-collection">
        <div className="dashboard-collection-bar">
          <div className="dashboard-collection-heading">
            <span className="dashboard-collection-title">Your subjects</span>
          </div>
          <Link to="/start/topic" className="button button-primary dashboard-collection-action">
            + New subject
          </Link>
        </div>

        {projects.length === 0 ? (
          <div className="dashboard-empty-state">
            <div className="dashboard-empty-state-icon">📚</div>
            <h3>No subjects yet</h3>
            <p>Start your first study session to create a visual subject card here. Your study sessions, review topics, and study momentum will appear automatically.</p>
            <Link to="/start/topic" className="button button-primary">Start a study session</Link>
          </div>
        ) : (
          <div className="dashboard-showcase-grid">
            {projects.map(({ subject, sessions, progress, badge, tooltip, nextReview, lastActive, theme, coverImageUrl }) => {
              const cardStyle = { background: theme.gradient } satisfies CSSProperties;
              const reviewBadge = nextReview.length > 0
                ? `${nextReview.length} review${nextReview.length === 1 ? "" : "s"}`
                : `${sessions.length} study session${sessions.length === 1 ? "" : "s"}`;

              return (
                <Link key={subject} to={`/projects/${encodeURIComponent(subject)}`} className="dashboard-showcase-card">
                  <div className="dashboard-showcase-media" style={cardStyle}>
                    <img
                      src={coverImageUrl ?? theme.image}
                      alt={`${subject} subject cover`}
                      className="dashboard-showcase-image"
                      loading="lazy"
                    />
                    <div className="dashboard-showcase-media-overlay" />
                    <div className="dashboard-showcase-tags">
                      <span className="dashboard-showcase-tag">
                        <span aria-hidden="true">{theme.icon}</span>
                        {theme.label}
                      </span>
                      <span className="dashboard-showcase-tag" title={tooltip}>{reviewBadge}</span>
                    </div>
                  </div>
                  <div className="dashboard-showcase-body">
                    <div className="dashboard-showcase-copy">
                      <h3>{subject}</h3>
                      <p>{projectFocusText(nextReview, sessions.length, progress)}</p>
                    </div>
                    <div className="dashboard-showcase-meta">
                      <span>{progress}% progress</span>
                      <span>Updated {formatDate(lastActive)}</span>
                    </div>
                    <div className="dashboard-showcase-footer">
                      <span className="dashboard-showcase-footnote">
                        <span aria-hidden="true">{subjectIcon(subject)}</span>
                        {badge}
                      </span>
                      <span className="dashboard-showcase-arrow" aria-hidden="true">›</span>
                    </div>
                  </div>
                </Link>
              );
            })}

            <Link to="/start/topic" className="dashboard-showcase-card dashboard-showcase-card-new">
              <div className="dashboard-showcase-media dashboard-showcase-media-new">
                <div className="dashboard-showcase-media-new-mark">+</div>
                <div className="dashboard-showcase-tags">
                  <span className="dashboard-showcase-tag">Fresh start</span>
                </div>
              </div>
              <div className="dashboard-showcase-body">
                <div className="dashboard-showcase-copy">
                  <h3>Create a new subject</h3>
                  <p>Launch a subject, upload materials, and let the tutor start organizing your next study track.</p>
                </div>
                <div className="dashboard-showcase-meta">
                  <span>New workspace</span>
                  <span>Start now</span>
                </div>
                <div className="dashboard-showcase-footer">
                  <span className="dashboard-showcase-footnote">Open the subject setup flow</span>
                  <span className="dashboard-showcase-arrow" aria-hidden="true">›</span>
                </div>
              </div>
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}
