import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { ArrowRight, BookOpen, CalendarDays, Plus } from "lucide-react";

import { getCurrentUser, listAssignments, listConversations, listProjectProfiles } from "../api";
import { conversationLastActivityTime } from "../conversations";
import { normalizeSubject, subjectCoverImage } from "../subjects";
import type { Conversation } from "../types";
import { useStartSessionModal } from "./StartSessionModalContext";
import { buttonClass } from "./buttonClass";


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
    const map = new Map<string, { subject: string; convs: Conversation[]; lastActive: number }>();
    // Seed from project profiles so subjects with no conversations still appear.
    for (const profile of projectProfiles) {
      const subject = profile.subject?.trim();
      if (!subject) continue;
      const subjectKey = normalizeSubject(subject);
      map.set(subjectKey, { subject, convs: [], lastActive: 0 });
    }
    for (const c of conversations) {
      const subject = c.subject?.trim();
      if (!subject) continue;
      const subjectKey = normalizeSubject(subject);
      const existing = map.get(subjectKey) ?? { subject, convs: [], lastActive: conversationLastActivityTime(c) };
      existing.convs.push(c);
      existing.lastActive = Math.max(existing.lastActive, conversationLastActivityTime(c));
      map.set(subjectKey, existing);
    }
    return Array.from(map.values()).map(({ subject, lastActive }) => ({
      subject,
      lastActive,
      coverImageUrl: projectProfileBySubject.get(normalizeSubject(subject))?.cover_image_url ?? null,
    })).sort((a, b) => b.lastActive - a.lastActive);
  })();

  const displayName = user?.name?.trim() || user?.email.split("@")[0] || "there";
  const firstName = displayName.split(/\s+/)[0];

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
            {projects.map(({ subject, lastActive, coverImageUrl }) => (
              <Link key={subject} to={`/projects/${encodeURIComponent(subject)}`} className="dashboard-showcase-card">
                <div className="dashboard-showcase-media">
                  <img
                    src={coverImageUrl ?? subjectCoverImage(subject)}
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
