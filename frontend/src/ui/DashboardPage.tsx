import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, BookOpen, CalendarDays, Plus } from "lucide-react";

import { getCurrentUser, listAssignments, listConversations, listProjectProfiles, previewReviewDigest, sendReviewDigest } from "../api";
import { conversationLastActivityTime } from "../conversations";
import { normalizeSubject } from "../subjects";
import type { Conversation, PendingAgentAction } from "../types";
import { useStartSessionModal } from "./StartSessionModalContext";
import { buttonClass } from "./buttonClass";

type SubjectTheme = {
  image: string;
};

const SUBJECT_THEMES: Array<{ match: string[]; theme: SubjectTheme }> = [
  {
    match: ["biology", "anatomy", "botany", "zoology"],
    theme: {
      image: "https://images.unsplash.com/photo-1532187643603-ba119ca4109e?auto=format&fit=crop&w=1200&q=80",
    },
  },
  {
    match: ["chemistry", "organic", "biochem"],
    theme: {
      image: "https://images.unsplash.com/photo-1532094349884-543bc11b234d?auto=format&fit=crop&w=1200&q=80",
    },
  },
  {
    match: ["physics", "mechanics", "thermo", "electric"],
    theme: {
      image: "https://images.unsplash.com/photo-1636466497217-26a8cbeaf0aa?auto=format&fit=crop&w=1200&q=80",
    },
  },
  {
    match: ["math", "algebra", "geometry", "calculus", "statistics"],
    theme: {
      image: "https://images.unsplash.com/photo-1509228468518-180dd4864904?auto=format&fit=crop&w=1200&q=80",
    },
  },
  {
    match: ["history", "government", "politics", "geography"],
    theme: {
      image: "https://images.unsplash.com/photo-1461360370896-922624d12aa1?auto=format&fit=crop&w=1200&q=80",
    },
  },
  {
    match: ["english", "writing", "literature", "reading"],
    theme: {
      image: "https://images.unsplash.com/photo-1455390582262-044cdead277a?auto=format&fit=crop&w=1200&q=80",
    },
  },
  {
    match: ["computer", "coding", "programming", "software"],
    theme: {
      image: "https://images.unsplash.com/photo-1515879218367-8466d910aaa4?auto=format&fit=crop&w=1200&q=80",
    },
  },
  {
    match: ["economics", "finance", "accounting", "business"],
    theme: {
      image: "https://images.unsplash.com/photo-1520607162513-77705c0f0d4a?auto=format&fit=crop&w=1200&q=80",
    },
  },
  {
    match: ["psychology", "sociology"],
    theme: {
      image: "https://images.unsplash.com/photo-1507413245164-6160d8298b31?auto=format&fit=crop&w=1200&q=80",
    },
  },
];

const DEFAULT_THEME: SubjectTheme = {
  image: "https://images.unsplash.com/photo-1513258496099-48168024aec0?auto=format&fit=crop&w=1200&q=80",
};

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

function formatDate(value: string | number): string {
  return new Date(value).toLocaleDateString([], { month: "short", day: "numeric" });
}

function formatDue(value: string): string {
  return new Date(value).toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

export function DashboardPage() {
  const { openStartSession } = useStartSessionModal();
  const [digestAction, setDigestAction] = useState<PendingAgentAction | null>(null);
  const [digestStatus, setDigestStatus] = useState<string | null>(null);
  const [digestBusy, setDigestBusy] = useState(false);
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

  const { data: assignments = [] } = useQuery({
    queryKey: ["assignments", "dashboard"],
    queryFn: () => listAssignments(),
    staleTime: 30_000,
  });

  const upcomingAssignments = (() => {
    const now = Date.now();
    return assignments.filter((a) => new Date(a.due_at).getTime() >= now);
  })();

  const showCalendarBand = upcomingAssignments.length > 0;
  const calendarPanelCount = Number(upcomingAssignments.length > 0);

  const projectProfileBySubject = new Map(projectProfiles.map((profile) => [normalizeSubject(profile.subject), profile]));

  const projects = (() => {
    const map = new Map<string, { convs: Conversation[]; lastActive: number }>();
    for (const c of conversations) {
      const subject = c.subject?.trim();
      // Only conversations explicitly tied to a subject become a "subject" tile.
      // Skip subject-less chats so they don't materialize a phantom "General".
      if (!subject) continue;
      const subjectKey = normalizeSubject(subject);
      const existing = map.get(subjectKey) ?? { convs: [], lastActive: conversationLastActivityTime(c) };
      existing.convs.push(c);
      existing.lastActive = Math.max(existing.lastActive, conversationLastActivityTime(c));
      map.set(subjectKey, existing);
    }
    return Array.from(map.entries()).map(([subjectKey, { convs, lastActive }]) => {
      const subject = convs.find((conversation) => conversation.subject?.trim())?.subject?.trim() ?? "";
      return {
        subject,
        lastActive,
        theme: subjectTheme(subject),
        coverImageUrl: projectProfileBySubject.get(subjectKey)?.cover_image_url ?? null,
      };
    }).sort((a, b) => b.lastActive - a.lastActive);
  })();

  const displayName = user?.name?.trim() || user?.email.split("@")[0] || "there";
  const firstName = displayName.split(/\s+/)[0];

  async function handleDashboardDigest() {
    setDigestBusy(true);
    setDigestStatus(null);
    try {
      const subject = upcomingAssignments.find((assignment) => assignment.subject)?.subject ?? projects[0]?.subject ?? null;
      const action = await previewReviewDigest(subject);
      setDigestAction(action);
      setDigestStatus("Review plan ready.");
    } catch (err) {
      setDigestStatus(err instanceof Error ? err.message : "Could not build review plan.");
    } finally {
      setDigestBusy(false);
    }
  }

  async function handleSendDashboardDigest() {
    if (!digestAction) return;
    setDigestBusy(true);
    try {
      const result = await sendReviewDigest(digestAction.id);
      setDigestStatus(`Review plan sent${result.provider === "noop" ? " (development no-op)" : ""}.`);
      setDigestAction(null);
    } catch (err) {
      setDigestStatus(err instanceof Error ? err.message : "Could not send review plan.");
    } finally {
      setDigestBusy(false);
    }
  }

  return (
    <div className="dashboard">
      <div className="dashboard-hero">
        <h1 className="dashboard-greeting">{timeOfDayGreeting()}, {firstName}</h1>
      </div>

      {showCalendarBand && (
        <section className="dashboard-calendar-band">
          <div className={`dashboard-calendar-grid ${calendarPanelCount === 1 ? "dashboard-calendar-grid-single" : ""}`}>
            {upcomingAssignments.length > 0 && (
              <div className="dashboard-calendar-panel">
                <div className="dashboard-calendar-panel-title">Upcoming deadlines</div>
                {upcomingAssignments.slice(0, 2).map((assignment) => (
                  <Link
                    className="dashboard-deadline-row"
                    key={assignment.id}
                    to={assignment.subject ? `/projects/${encodeURIComponent(assignment.subject)}` : "/calendar"}
                  >
                    <CalendarDays size={15} strokeWidth={2} />
                    <span>{assignment.title}</span>
                    <strong>{formatDue(assignment.due_at)}</strong>
                  </Link>
                ))}
              </div>
            )}
          </div>
        </section>
      )}

      <section className="mx-auto mb-4 flex max-w-[1120px] flex-col gap-3 rounded-xl border border-[var(--panel-border)] bg-[var(--surface)] p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="text-[0.78rem] font-bold uppercase tracking-[0.08em] text-[var(--accent)]">Smart Review</div>
            <p className="m-0 text-sm text-[var(--text-soft)]">Generate a bounded review digest from deadlines, weak topics, notes, and due flashcards.</p>
          </div>
          <button className={buttonClass("secondary")} disabled={digestBusy} onClick={() => void handleDashboardDigest()} type="button">
            {digestBusy ? "Preparing..." : "Email review plan"}
          </button>
        </div>
        {digestAction?.preview ? (
          <div className="rounded-lg border border-[var(--panel-border)] bg-[var(--panel-bg)] p-3 text-sm text-[var(--text)]">
            <strong>{digestAction.preview.email_subject}</strong>
            <p className="m-0 mt-1 text-[var(--text-soft)]">{digestAction.preview.reason}</p>
            <div className="mt-3 flex gap-2">
              <button className={buttonClass("primary")} disabled={digestBusy} onClick={() => void handleSendDashboardDigest()} type="button">Send</button>
              <button className={buttonClass("secondary")} disabled={digestBusy} onClick={() => setDigestAction(null)} type="button">Dismiss</button>
            </div>
          </div>
        ) : null}
        {digestStatus ? <p className="m-0 text-sm text-[var(--text-soft)]">{digestStatus}</p> : null}
      </section>

      <div className="dashboard-collection">
        <div className="dashboard-collection-bar">
          <div className="dashboard-collection-heading">
            <span className="dashboard-collection-title">Your subjects</span>
          </div>
          <button className={buttonClass("primary", "dashboard-collection-action")} onClick={() => openStartSession()} type="button">
            <Plus size={15} strokeWidth={2.2} />
            New subject
          </button>
        </div>

        {projects.length === 0 ? (
          <div className="dashboard-empty-state">
            <div className="dashboard-empty-state-icon"><BookOpen size={28} strokeWidth={1.6} /></div>
            <h3>No subjects yet</h3>
            <p>
              Create one subject for each class, exam, or skill. Sapient will keep its sessions,
              materials, notes, and flashcards together.
            </p>
            <div className="empty-state-tips" aria-label="Subject examples">
              <span>Calculus II</span>
              <span>Human Computer Interaction</span>
              <span>Interview prep</span>
            </div>
            <button className={buttonClass("primary")} onClick={() => openStartSession()} type="button">Create a subject</button>
          </div>
        ) : (
          <div className="dashboard-showcase-grid">
            {projects.map(({ subject, lastActive, theme, coverImageUrl }) => (
              <Link key={subject} to={`/projects/${encodeURIComponent(subject)}`} className="dashboard-showcase-card">
                <div className="dashboard-showcase-media">
                  <img
                    src={coverImageUrl ?? theme.image}
                    alt={`${subject} subject cover`}
                    className="dashboard-showcase-image"
                    loading="lazy"
                  />
                  <div className="dashboard-showcase-media-overlay" />
                </div>
                <div className="dashboard-showcase-body">
                  <div className="dashboard-showcase-copy">
                    <h3>{subject}</h3>
                  </div>
                  <div className="dashboard-showcase-footer">
                    <span>Updated {formatDate(lastActive)}</span>
                    <span className="dashboard-showcase-arrow" aria-hidden="true">
                      <ArrowRight size={16} strokeWidth={2} />
                    </span>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
