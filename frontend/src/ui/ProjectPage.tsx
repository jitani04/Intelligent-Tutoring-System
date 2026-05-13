import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { CSSProperties } from "react";
import { useEffect, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { ChevronDown, ChevronUp, Pencil, Trash2 } from "lucide-react";

import { RateLimitError, createConversation, deleteConversation, generateMindMap, generateSummary, generateWeakQuiz, getCurrentUser, getProjectProfile, getProjectProgress, listConversations } from "../api";
import { normalizeSubject } from "../subjects";
import type { Conversation, PracticeQuizItem, SessionSummary } from "../types";
import { LectureModeOverlay } from "./LectureModeOverlay";
import { WeakQuizModal } from "./WeakQuizModal";

function SectionToggle({ open, onClick, label }: { open: boolean; onClick: () => void; label: string }) {
  return (
    <button
      aria-expanded={open}
      aria-label={`${open ? "Hide" : "Show"} ${label}`}
      className="project-section-toggle"
      onClick={onClick}
      title={open ? "Hide" : "Show"}
      type="button"
    >
      {open ? <ChevronUp size={16} strokeWidth={2} /> : <ChevronDown size={16} strokeWidth={2} />}
    </button>
  );
}

function formatDate(value: string): string {
  return new Date(value).toLocaleDateString([], { month: "short", day: "numeric", year: "numeric" });
}

function formatTimestamp(value: string): string {
  return new Date(value).toLocaleString([], {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

function lastAssistantMessageTimestamp(conversation: Conversation): string | null {
  const lastAssistantMessage = [...conversation.messages].reverse().find((message) => message.role === "assistant");
  return lastAssistantMessage?.created_at ?? null;
}

const LEVEL_LABELS: Record<string, string> = {
  beginner: "Beginner",
  some: "Some experience",
  intermediate: "Intermediate",
  advanced: "Advanced",
};

type ProjectSectionKey = "goals" | "cover" | "progress" | "map" | "sessions";
type ProjectSectionVisibility = Record<ProjectSectionKey, boolean>;

const DEFAULT_PROJECT_SECTION_VISIBILITY: ProjectSectionVisibility = {
  goals: true,
  cover: true,
  progress: true,
  map: true,
  sessions: true,
};

function projectSectionStorageKey(subject: string): string {
  return `its-project-sections:${normalizeSubject(subject)}`;
}

function getStoredProjectSectionVisibility(subject: string): ProjectSectionVisibility {
  if (typeof window === "undefined") {
    return DEFAULT_PROJECT_SECTION_VISIBILITY;
  }

  const rawValue = window.localStorage.getItem(projectSectionStorageKey(subject));
  if (!rawValue) {
    return DEFAULT_PROJECT_SECTION_VISIBILITY;
  }

  try {
    const parsed = JSON.parse(rawValue) as Partial<ProjectSectionVisibility>;
    return {
      goals: parsed.goals ?? DEFAULT_PROJECT_SECTION_VISIBILITY.goals,
      cover: parsed.cover ?? DEFAULT_PROJECT_SECTION_VISIBILITY.cover,
      progress: parsed.progress ?? DEFAULT_PROJECT_SECTION_VISIBILITY.progress,
      map: parsed.map ?? DEFAULT_PROJECT_SECTION_VISIBILITY.map,
      sessions: parsed.sessions ?? DEFAULT_PROJECT_SECTION_VISIBILITY.sessions,
    };
  } catch {
    return DEFAULT_PROJECT_SECTION_VISIBILITY;
  }
}

function buildSummaryText(subject: string, sessionNum: number, date: string, s: SessionSummary): string {
  const lines: string[] = [
    `Study Session ${sessionNum} Summary — ${subject}`,
    `Date: ${date}`,
    "",
    "COVERED",
    ...s.covered.map((t) => `• ${t}`),
    "",
  ];
  if (s.struggled_with.length > 0) {
    lines.push("STRUGGLED WITH", ...s.struggled_with.map((t) => `• ${t}`), "");
  }
  lines.push(
    "KEY CONCEPTS",
    ...s.key_concepts.map((t) => `• ${t}`),
    "",
    "REVIEW NEXT",
    ...s.next_review.map((t) => `• ${t}`),
  );
  return lines.join("\n");
}

function downloadSummary(subject: string, sessionNum: number, c: Conversation) {
  const s = c.summary as SessionSummary;
  const text = buildSummaryText(subject, sessionNum, formatDate(c.created_at), s);
  const blob = new Blob([text], { type: "text/plain" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${subject.replace(/\s+/g, "-").toLowerCase()}-study-session-${sessionNum}-summary.txt`;
  a.click();
  URL.revokeObjectURL(url);
}

export function ProjectPage() {
  const { subject } = useParams<{ subject: string }>();
  const decoded = decodeURIComponent(subject ?? "");
  const normalizedSubject = normalizeSubject(decoded);
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [expandedIds, setExpandedIds] = useState<Set<number>>(new Set());
  const [generatingId, setGeneratingId] = useState<number | null>(null);
  const [generateError, setGenerateError] = useState<string | null>(null);
  const [weakQuizzes, setWeakQuizzes] = useState<PracticeQuizItem[] | null>(null);
  const [generatingWeakQuiz, setGeneratingWeakQuiz] = useState(false);
  const [weakQuizError, setWeakQuizError] = useState<string | null>(null);
  const [lectureOpen, setLectureOpen] = useState(false);
  const [searchParams, setSearchParams] = useSearchParams();
  const showMindmapWarning = searchParams.get("warning") === "mindmap_unavailable";
  const [retryingMindmap, setRetryingMindmap] = useState(false);
  const [mindmapRetryError, setMindmapRetryError] = useState<string | null>(null);
  const [sectionVisibility, setSectionVisibility] = useState<ProjectSectionVisibility>(() => (
    getStoredProjectSectionVisibility(decoded)
  ));

  const { data: conversations = [] } = useQuery({
    queryKey: ["conversations"],
    queryFn: listConversations,
  });

  const { data: user } = useQuery({ queryKey: ["me"], queryFn: getCurrentUser });

  const { data: profile } = useQuery({
    queryKey: ["project-profile", decoded],
    queryFn: () => getProjectProfile(decoded),
  });

  const { data: progress } = useQuery({
    queryKey: ["project-progress", decoded],
    queryFn: () => getProjectProgress(decoded),
  });

  const sessions = conversations
    .filter((c) => normalizeSubject(c.subject) === normalizedSubject)
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

  const newSessionMutation = useMutation({
    mutationFn: () => createConversation(decoded),
    onSuccess: async (c) => {
      await queryClient.invalidateQueries({ queryKey: ["conversations"] });
      navigate(`/sessions/${c.id}`);
    },
  });

  const deleteSessionMutation = useMutation({
    mutationFn: deleteConversation,
    onSuccess: (_data, conversationId) => {
      void queryClient.invalidateQueries({ queryKey: ["conversations"] });
      queryClient.removeQueries({ queryKey: ["conversation", conversationId] });
      queryClient.removeQueries({ queryKey: ["conversation-quizzes", conversationId] });
      queryClient.removeQueries({ queryKey: ["key-ideas", conversationId] });
    },
  });

  function handleDeleteSession(conversationId: number) {
    if (deleteSessionMutation.isPending) return;
    if (!window.confirm("Delete this study session? This can't be undone.")) return;
    deleteSessionMutation.mutate(conversationId);
  }

  function toggleExpanded(id: number) {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  async function handleGenerateSummary(conversationId: number) {
    setGeneratingId(conversationId);
    setGenerateError(null);
    try {
      await generateSummary(conversationId);
      await queryClient.invalidateQueries({ queryKey: ["conversations"] });
      setExpandedIds((prev) => new Set([...prev, conversationId]));
    } catch (err) {
      if (err instanceof RateLimitError) {
        setGenerateError(`AI is rate-limited. Try again in ~${err.retryAfterSeconds}s.`);
      } else {
        setGenerateError(err instanceof Error ? err.message : "Failed to generate summary.");
      }
    } finally {
      setGeneratingId(null);
    }
  }

  async function handleRetryMindmap() {
    setRetryingMindmap(true);
    setMindmapRetryError(null);
    try {
      await generateMindMap(decoded);
      await queryClient.invalidateQueries({ queryKey: ["project-profile", decoded] });
      const next = new URLSearchParams(searchParams);
      next.delete("warning");
      setSearchParams(next, { replace: true });
    } catch (err) {
      if (err instanceof RateLimitError) {
        setMindmapRetryError(`AI is rate-limited. Try again in ~${err.retryAfterSeconds}s.`);
      } else {
        setMindmapRetryError(err instanceof Error ? err.message : "Mind map still unavailable. Try again later.");
      }
    } finally {
      setRetryingMindmap(false);
    }
  }

  async function handleGenerateWeakQuiz() {
    setGeneratingWeakQuiz(true);
    setWeakQuizError(null);
    try {
      const data = await generateWeakQuiz(decoded);
      setWeakQuizzes(data.quizzes);
    } catch (err) {
      if (err instanceof RateLimitError) {
        setWeakQuizError(`AI is rate-limited. Try again in ~${err.retryAfterSeconds}s.`);
      } else {
        setWeakQuizError(err instanceof Error ? err.message : "Failed to generate quiz. Try again.");
      }
    } finally {
      setGeneratingWeakQuiz(false);
    }
  }

  const allSectionsVisible = Object.values(sectionVisibility).every(Boolean);

  useEffect(() => {
    setSectionVisibility(getStoredProjectSectionVisibility(decoded));
  }, [decoded]);

  function updateSectionVisibility(nextValue: ProjectSectionVisibility | ((prev: ProjectSectionVisibility) => ProjectSectionVisibility)) {
    setSectionVisibility((prev) => {
      const next = typeof nextValue === "function" ? nextValue(prev) : nextValue;
      if (typeof window !== "undefined") {
        window.localStorage.setItem(projectSectionStorageKey(decoded), JSON.stringify(next));
      }
      return next;
    });
  }

  function toggleSection(section: ProjectSectionKey) {
    updateSectionVisibility((prev) => ({ ...prev, [section]: !prev[section] }));
  }

  function setAllSectionsVisibility(isVisible: boolean) {
    updateSectionVisibility({
      goals: isVisible,
      cover: isVisible,
      progress: isVisible,
      map: isVisible,
      sessions: isVisible,
    });
  }

  return (
    <div className="page-shell">
      <div className="page-header">
        <div className="page-header-text">
          <h1 className="page-title">{decoded}</h1>
          <p className="page-subtitle">
            {profile?.level ? LEVEL_LABELS[profile.level] ?? profile.level : null}
            {profile?.level && " · "}
            {sessions.length} study session{sessions.length !== 1 ? "s" : ""}
          </p>
        </div>
        <div className="page-header-actions">
          <button
            className="button button-secondary"
            onClick={() => setAllSectionsVisibility(!allSectionsVisible)}
            style={{ fontSize: "0.8rem", padding: "0.45rem 0.875rem" }}
            type="button"
          >
            {allSectionsVisible ? "Collapse all" : "Expand all"}
          </button>
          <Link
            to={`/projects/${encodeURIComponent(decoded)}/materials`}
            className="button button-secondary"
            style={{ fontSize: "0.8rem", padding: "0.45rem 0.875rem" }}
          >
            Materials
          </Link>
          <Link
            to={`/projects/${encodeURIComponent(decoded)}/flashcards`}
            className="button button-secondary"
            style={{ fontSize: "0.8rem", padding: "0.45rem 0.875rem" }}
          >
            Flashcards
          </Link>
          <Link
            to={`/projects/${encodeURIComponent(decoded)}/setup`}
            className="button button-secondary"
            style={{ fontSize: "0.8rem", padding: "0.45rem 0.875rem" }}
          >
            Edit subject / cover
          </Link>
          <button
            className="button button-secondary"
            onClick={() => setLectureOpen(true)}
            style={{ fontSize: "0.8rem", padding: "0.45rem 0.875rem" }}
            type="button"
          >
            ▶ Lecture mode
          </button>
          <button
            className="button button-primary"
            disabled={newSessionMutation.isPending}
            onClick={() => newSessionMutation.mutate()}
            type="button"
          >
            {newSessionMutation.isPending ? "Creating…" : "+ New study session"}
          </button>
        </div>
      </div>

      {showMindmapWarning && (
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: "0.75rem",
            padding: "0.75rem 1rem",
            marginBottom: "1rem",
            background: "var(--surface-2, #fff8e1)",
            border: "1px solid var(--warning-border, #f0c674)",
            borderRadius: "8px",
            fontSize: "0.85rem",
          }}
        >
          <div>
            <strong>Mind map not yet generated.</strong>{" "}
            The tutoring model was rate-limited during setup. Your subject is saved — you can retry the mind map any time.
            {mindmapRetryError && (
              <div style={{ marginTop: "0.25rem", color: "var(--error, #e55)" }}>{mindmapRetryError}</div>
            )}
          </div>
          <button
            type="button"
            className="button button-secondary"
            style={{ fontSize: "0.8rem", padding: "0.4rem 0.75rem", whiteSpace: "nowrap" }}
            onClick={handleRetryMindmap}
            disabled={retryingMindmap}
          >
            {retryingMindmap ? "Retrying…" : "Retry mind map"}
          </button>
        </div>
      )}

      {lectureOpen && (
        <LectureModeOverlay
          subject={decoded}
          tutorName={user?.tutor_name ?? "Sapient"}
          tutorInitials={(user?.tutor_name ?? "S").slice(0, 2).toUpperCase()}
          onClose={() => setLectureOpen(false)}
        />
      )}

      {profile?.goals && (
        <section className="project-section-shell">
          <div className="project-section-header">
            <div className="content-card-title project-section-title">Goals</div>
            <SectionToggle
              open={sectionVisibility.goals}
              onClick={() => toggleSection("goals")}
              label="goals"
            />
          </div>
          {sectionVisibility.goals && (
            <div className="project-goals">
              <span className="project-goals-label">Goals</span>
              <span className="project-goals-text">{profile.goals}</span>
            </div>
          )}
        </section>
      )}

      <section className="project-section-shell">
        <div className="project-section-header">
          <div className="content-card-title project-section-title">Cover</div>
          <SectionToggle
            open={sectionVisibility.cover}
            onClick={() => toggleSection("cover")}
            label="cover"
          />
        </div>
        {sectionVisibility.cover && (
          <div className="project-cover-card">
            {profile?.cover_image_url ? (
              <img
                src={profile.cover_image_url}
                alt={`${decoded} cover`}
                className="project-cover-image"
              />
            ) : (
              <div className="project-cover-image project-cover-image-empty" />
            )}
            <div className="project-cover-overlay" />
            <Link
              aria-label="Edit cover"
              to={`/projects/${encodeURIComponent(decoded)}/setup`}
              className="project-cover-edit"
              title="Edit cover"
            >
              <Pencil size={16} strokeWidth={2} />
            </Link>
            <div className="project-cover-content">
              <h2>{decoded}</h2>
            </div>
          </div>
        )}
      </section>

      {/* Progress section */}
      {progress && (progress.quizzes_attempted > 0 || progress.concepts_covered.length > 0) && (
        <section className="project-section-shell">
          <div className="project-section-header">
            <div className="progress-section-title project-section-title">Progress</div>
            <SectionToggle
              open={sectionVisibility.progress}
              onClick={() => toggleSection("progress")}
              label="progress"
            />
          </div>
          {sectionVisibility.progress && (
            <div className="progress-section-grid">

              {/* Quiz accuracy */}
              {progress.quizzes_attempted > 0 && (
                <div className="progress-stat-card">
                  <div className="progress-stat-label">Quiz accuracy</div>
                  <div className="progress-stat-value">
                    {progress.pass_rate !== null ? `${progress.pass_rate}%` : "—"}
                  </div>
                  <div className="progress-stat-sub">
                    {progress.quizzes_passed} / {progress.quizzes_attempted} correct
                  </div>
                  <div className="progress-bar progress-bar-sm" style={{ marginTop: "0.5rem" }}>
                    <div
                      className="progress-fill"
                      style={{ width: `${progress.pass_rate ?? 0}%`, background: (progress.pass_rate ?? 0) >= 70 ? "var(--success, #22c55e)" : "var(--accent)" }}
                    />
                  </div>
                </div>
              )}

              {/* Concepts covered */}
              {progress.concepts_covered.length > 0 && (
                <div className="progress-stat-card progress-stat-card-wide">
                  <div className="progress-stat-label">Concepts covered</div>
                  <div className="progress-topic-list">
                    {progress.concepts_covered.map((t) => (
                      <span key={t} className="progress-topic-chip progress-topic-chip-covered">{t}</span>
                    ))}
                  </div>
                </div>
              )}

              {/* Weak areas */}
              {progress.weak_areas.length > 0 && (
                <div className="progress-stat-card progress-stat-card-wide">
                  <div className="progress-stat-label">Areas to strengthen</div>
                  <div className="progress-topic-list">
                    {progress.weak_areas.map((t) => (
                      <span key={t} className="progress-topic-chip progress-topic-chip-weak">{t}</span>
                    ))}
                  </div>
                  <div className="weak-quiz-action">
                    <button
                      className="button button-primary"
                      disabled={generatingWeakQuiz}
                      onClick={() => void handleGenerateWeakQuiz()}
                      type="button"
                    >
                      {generatingWeakQuiz ? "Generating…" : "Practice weak areas"}
                    </button>
                    {weakQuizError && (
                      <p className="weak-quiz-error">{weakQuizError}</p>
                    )}
                  </div>
                </div>
              )}

              {/* Next review */}
              {progress.next_review.length > 0 && (
                <div className="progress-stat-card progress-stat-card-wide">
                  <div className="progress-stat-label">Review next study session</div>
                  <div className="progress-topic-list">
                    {progress.next_review.map((t) => (
                      <span key={t} className="progress-topic-chip progress-topic-chip-review">{t}</span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </section>
      )}

      {/* Mind map */}
      <section className="project-section-shell">
        <div className="project-section-header">
          <div className="content-card-title project-section-title">
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
          <SectionToggle
            open={sectionVisibility.map}
            onClick={() => toggleSection("map")}
            label="learning map"
          />
        </div>
        {sectionVisibility.map && (
          <div className="content-card">
            {profile?.mind_map ? (
              <div className="mindmap">
                <div className="mindmap-flow">
                  <div className="mindmap-root">{profile.mind_map.subject}</div>
                  {profile.mind_map.nodes.map((node, index) => (
                    <div key={node.topic} className="mindmap-node" style={{ "--node-index": index } as CSSProperties}>
                      <div className="mindmap-node-title">{node.topic}</div>
                      <div className="mindmap-subtopics">
                        {node.subtopics.map((sub, subIndex) => (
                          <span
                            key={sub}
                            className="mindmap-subtopic"
                            style={{ "--subtopic-index": subIndex } as CSSProperties}
                          >
                            {sub}
                          </span>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <p className="muted" style={{ fontSize: "0.875rem" }}>
                Complete the subject setup to generate a learning map.
              </p>
            )}
          </div>
        )}
      </section>

      {/* Study sessions list */}
      <section className="project-section-shell">
        <div className="project-section-header">
          <div className="content-card-title project-section-title">Study Sessions</div>
          <SectionToggle
            open={sectionVisibility.sessions}
            onClick={() => toggleSection("sessions")}
            label="study sessions"
          />
        </div>
        {sectionVisibility.sessions && (
          <>
            {generateError && (
              <p style={{ fontSize: "0.8rem", color: "var(--error, #e55)", marginBottom: "0.5rem" }}>{generateError}</p>
            )}
            {sessions.length === 0 ? (
              <div className="empty-state">
                <div className="empty-state-icon">💬</div>
                <h3>No study sessions yet</h3>
                <p>Start your first study session for this subject.</p>
                <button className="button button-primary" onClick={() => newSessionMutation.mutate()} type="button">
                  Start study session
                </button>
              </div>
            ) : (
              <div className="content-card" style={{ padding: 0, overflow: "hidden" }}>
                {sessions.map((c, i) => {
                  const sessionNum = sessions.length - i;
                  const isExpanded = expandedIds.has(c.id);
                  const hasSummary = !!c.summary;
                  const lastAssistantAt = lastAssistantMessageTimestamp(c);
                  return (
                    <div key={c.id} className="project-session-wrap">
                      <div className="project-session-row" style={{ borderTop: i === 0 ? "none" : undefined }}>
                        <div className="project-session-info">
                          <div className="project-session-num">Study Session {sessionNum}</div>
                          <div className="project-session-meta">
                            {lastAssistantAt ? formatTimestamp(lastAssistantAt) : "No tutor reply yet"}
                            {hasSummary && <span className="session-summary-badge">Summary</span>}
                          </div>
                        </div>
                        <div className="project-session-actions">
                          {hasSummary ? (
                            <>
                              <button
                                className={`button button-secondary session-summary-toggle ${isExpanded ? "active" : ""}`}
                                onClick={() => toggleExpanded(c.id)}
                                type="button"
                                style={{ fontSize: "0.78rem", padding: "0.4rem 0.8rem" }}
                              >
                                {isExpanded ? "Hide summary ↑" : "View summary ↓"}
                              </button>
                              <button
                                className="button button-secondary session-download-btn"
                                onClick={() => downloadSummary(decoded, sessionNum, c)}
                                title="Download summary as text file"
                                type="button"
                                style={{ fontSize: "0.8rem", padding: "0.4rem 0.65rem" }}
                              >
                                ↓
                              </button>
                            </>
                          ) : (
                            <button
                              className="button button-secondary"
                              disabled={generatingId === c.id || c.messages.length < 2}
                              onClick={() => void handleGenerateSummary(c.id)}
                              title={c.messages.length < 2 ? "Study session is too short to summarize" : undefined}
                              type="button"
                              style={{ fontSize: "0.78rem", padding: "0.4rem 0.8rem" }}
                            >
                              {generatingId === c.id ? "Generating…" : "Summarize"}
                            </button>
                          )}
                          <Link
                            className="button button-secondary"
                            to={`/sessions/${c.id}`}
                            style={{ fontSize: "0.8rem", padding: "0.4rem 0.8rem" }}
                          >
                            {c.messages.length === 0 ? "Open" : "Resume"}
                          </Link>
                          <button
                            aria-label={`Delete Study Session ${sessionNum}`}
                            className="project-session-delete"
                            disabled={deleteSessionMutation.isPending}
                            onClick={() => handleDeleteSession(c.id)}
                            title="Delete study session"
                            type="button"
                          >
                            <Trash2 size={15} strokeWidth={1.8} />
                          </button>
                        </div>
                      </div>

                      {isExpanded && hasSummary && (
                        <div className="session-summary-panel">
                          <div className="session-summary-grid">
                            <div className="session-summary-group">
                              <div className="session-summary-label">Covered</div>
                              <ul>{(c.summary as SessionSummary).covered.map((t, j) => <li key={j}>{t}</li>)}</ul>
                            </div>
                            {(c.summary as SessionSummary).struggled_with.length > 0 && (
                              <div className="session-summary-group">
                                <div className="session-summary-label">Struggled With</div>
                                <ul>{(c.summary as SessionSummary).struggled_with.map((t, j) => <li key={j}>{t}</li>)}</ul>
                              </div>
                            )}
                            <div className="session-summary-group">
                              <div className="session-summary-label">Key Concepts</div>
                              <ul>{(c.summary as SessionSummary).key_concepts.map((t, j) => <li key={j}>{t}</li>)}</ul>
                            </div>
                            <div className="session-summary-group">
                              <div className="session-summary-label">Review Next</div>
                              <ul>{(c.summary as SessionSummary).next_review.map((t, j) => <li key={j}>{t}</li>)}</ul>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </>
        )}
      </section>
      {weakQuizzes && (
        <WeakQuizModal quizzes={weakQuizzes} onClose={() => setWeakQuizzes(null)} />
      )}
    </div>
  );
}
