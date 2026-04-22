import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";

import { createConversation, getConversation, listConversations, streamChat } from "../api";
import {
  attachContextToConversation,
  clearPendingStudyContext,
  getConversationContext,
  getPendingStudyContext,
  getStoredUserId,
} from "../studyState";
import type { ChatStreamEvent, Conversation, Message, RetrievedSource } from "../types";

const QUICK_PROMPTS = [
  "Quiz me on this topic instead of giving the answer immediately.",
  "Explain the concept step by step, then check my understanding.",
  "Give me a hint first and wait for my attempt.",
];

const SESSION_CONTROLS = [
  {
    label: "Need a hint",
    prompt: "I'm stuck. Give me one targeted hint without revealing the final answer.",
  },
  {
    label: "Explain differently",
    prompt: "Explain the idea differently and connect it to a simple analogy.",
  },
  {
    label: "Ready to move on",
    prompt: "I understand this part. Give me the next question or a harder follow-up.",
  },
];

function formatConversationDate(value: string): string {
  return new Date(value).toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function formatElapsed(startValue: string | null): string {
  if (!startValue) {
    return "0 min";
  }

  const elapsedMs = Date.now() - new Date(startValue).getTime();
  const minutes = Math.max(0, Math.floor(elapsedMs / 60000));

  if (minutes < 60) {
    return `${minutes} min`;
  }

  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  return `${hours}h ${remainingMinutes}m`;
}

export function ChatPage() {
  const params = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const messageListRef = useRef<HTMLDivElement | null>(null);

  const routeConversationId = params.conversationId ? Number(params.conversationId) : null;
  const [userIdInput, setUserIdInput] = useState(() => getStoredUserId());
  const [draft, setDraft] = useState("");
  const [streamedAssistantText, setStreamedAssistantText] = useState("");
  const [streamError, setStreamError] = useState<string | null>(null);
  const [isStreaming, setIsStreaming] = useState(false);
  const [retrievedSources, setRetrievedSources] = useState<RetrievedSource[]>([]);
  const [pendingContext, setPendingContext] = useState(() => getPendingStudyContext());
  const [elapsedLabel, setElapsedLabel] = useState("0 min");

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

  const activeConversationQuery = useQuery({
    queryKey: ["conversation", parsedUserId, routeConversationId],
    queryFn: () => getConversation(parsedUserId, routeConversationId!),
    enabled: isValidUserId && routeConversationId !== null,
  });

  const createConversationMutation = useMutation({
    mutationFn: () => createConversation(parsedUserId),
    onSuccess: async (conversation) => {
      const nextPendingContext = getPendingStudyContext();
      if (nextPendingContext) {
        attachContextToConversation(conversation.id, nextPendingContext);
        clearPendingStudyContext();
        setPendingContext(null);
      }

      await queryClient.invalidateQueries({ queryKey: ["conversations", parsedUserId] });
      navigate(`/sessions/${conversation.id}`);
    },
  });

  const activeConversation = activeConversationQuery.data ?? null;
  const activeStudyContext = useMemo(() => {
    if (activeConversation) {
      return getConversationContext(activeConversation.id);
    }

    return pendingContext;
  }, [activeConversation, pendingContext]);

  const conversationCount = conversationsQuery.data?.length ?? 0;
  const lastSavedMessage = activeConversation?.messages.at(-1) ?? null;
  const renderedMessages = activeConversation?.messages ?? [];
  const workspaceTitle =
    activeStudyContext?.topic ?? (activeConversation ? `Conversation #${activeConversation.id}` : "New tutoring chat");

  useEffect(() => {
    const container = messageListRef.current;
    if (!container) {
      return;
    }

    container.scrollTop = container.scrollHeight;
  }, [activeConversation?.messages, streamedAssistantText]);

  useEffect(() => {
    const startValue = activeConversation?.created_at ?? activeStudyContext?.createdAt ?? null;
    setElapsedLabel(formatElapsed(startValue));

    if (!startValue) {
      return;
    }

    const timer = window.setInterval(() => {
      setElapsedLabel(formatElapsed(startValue));
    }, 30000);

    return () => window.clearInterval(timer);
  }, [activeConversation?.created_at, activeStudyContext?.createdAt]);

  useEffect(() => {
    setRetrievedSources([]);
  }, [routeConversationId]);

  async function handleCreateConversation() {
    setStreamError(null);
    setStreamedAssistantText("");
    await createConversationMutation.mutateAsync();
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const message = draft.trim();
    if (!message || !isValidUserId || isStreaming) {
      return;
    }

    setDraft("");
    setStreamError(null);
    setStreamedAssistantText("");
    setRetrievedSources([]);
    setIsStreaming(true);

    let targetConversation = activeConversation;
    if (!targetConversation) {
      targetConversation = await createConversationMutation.mutateAsync();
    }

    const optimisticUserMessage: Message = {
      id: -1,
      conversation_id: targetConversation.id,
      role: "user",
      content: message,
      created_at: new Date().toISOString(),
    };

    queryClient.setQueryData<Conversation | undefined>(
      ["conversation", parsedUserId, targetConversation.id],
      (current) =>
        current
          ? {
              ...current,
              messages: [...current.messages, optimisticUserMessage],
            }
          : current,
    );

    try {
      await streamChat(parsedUserId, targetConversation.id, { message }, handleStreamEvent);
      await queryClient.invalidateQueries({ queryKey: ["conversation", parsedUserId, targetConversation.id] });
      await queryClient.invalidateQueries({ queryKey: ["conversations", parsedUserId] });
    } catch (error) {
      setStreamError(error instanceof Error ? error.message : "Streaming failed.");
      await queryClient.invalidateQueries({ queryKey: ["conversation", parsedUserId, targetConversation.id] });
    } finally {
      setIsStreaming(false);
      setStreamedAssistantText("");
    }
  }

  function handleStreamEvent(event: ChatStreamEvent) {
    if (event.event === "token") {
      setStreamedAssistantText((current) => current + event.data.delta);
      return;
    }

    if (event.event === "sources") {
      setRetrievedSources(event.data.sources);
      return;
    }

    if (event.event === "error") {
      setStreamError(event.data.error);
    }
  }

  return (
    <div className="notebook-layout">
      <header className="workspace-topbar">
        <div className="workspace-topbar-title">
          <Link className="workspace-brand" to="/">
            <span className="workspace-brand-mark">KP</span>
          </Link>

          <div>
            <h1>{workspaceTitle}</h1>
            <p>{activeStudyContext?.subject ?? "General study"}</p>
          </div>
        </div>

        <div className="workspace-topbar-actions">
          <button
            className="button button-primary"
            disabled={!isValidUserId || createConversationMutation.isPending}
            onClick={() => void handleCreateConversation()}
            type="button"
          >
            New chat
          </button>
          <Link className="button button-secondary" to="/materials">
            Materials
          </Link>
          <Link className="button button-secondary" to="/history">
            History
          </Link>
        </div>
      </header>

      <div className="workspace-shell">
        <aside className="workspace-sidebar">
          <div className="workspace-panel-header">
            <h2>Workspace</h2>
          </div>

          <div className="workspace-sidebar-body">
            <div className="workspace-sidebar-actions">
              <Link className="button button-secondary workspace-side-button" to="/start/topic">
                Guided setup
              </Link>
              <Link className="button button-secondary workspace-side-button" to="/materials">
                Add materials
              </Link>
            </div>

            <div className="workspace-summary-card">
              <div className="workspace-summary-row">
                <span>Subject</span>
                <strong>{activeStudyContext?.subject ?? "General study"}</strong>
              </div>
              <div className="workspace-summary-row">
                <span>Topic</span>
                <strong>{activeStudyContext?.topic ?? "Not set yet"}</strong>
              </div>
              <div className="workspace-summary-row">
                <span>Session time</span>
                <strong>{elapsedLabel}</strong>
              </div>
            </div>

            <label className="flow-field compact">
              <span>Demo user</span>
              <input
                min={1}
                onChange={(event) => setUserIdInput(event.target.value)}
                type="number"
                value={userIdInput}
              />
            </label>

            {!isValidUserId ? <p className="error-text">Enter a valid user id to load sessions.</p> : null}
            {conversationsQuery.isLoading ? <p className="muted">Loading conversations…</p> : null}
            {conversationsQuery.isError ? <p className="error-text">Failed to load conversations.</p> : null}

            <div className="workspace-session-group">
              <div className="workspace-section-label">
                <span>Sessions</span>
                <strong>{conversationCount}</strong>
              </div>

              <div className="conversation-list notebook-conversation-list">
                {conversationsQuery.data?.length === 0 ? (
                  <div className="conversation-empty">
                    <p>No saved sessions yet.</p>
                    <span>Create one and start the first tutoring exchange.</span>
                  </div>
                ) : null}

                {conversationsQuery.data?.map((conversation) => {
                  const isActive = conversation.id === routeConversationId;
                  const preview = conversation.messages.at(-1)?.content ?? "Empty conversation";
                  const meta = conversation.messages.at(-1)?.created_at ?? conversation.created_at;
                  const context = getConversationContext(conversation.id);

                  return (
                    <Link
                      className={isActive ? "conversation-link active" : "conversation-link"}
                      key={conversation.id}
                      to={`/sessions/${conversation.id}`}
                    >
                      <span className="conversation-title">{context?.topic ?? `Conversation #${conversation.id}`}</span>
                      <span className="conversation-preview">{preview}</span>
                      <span className="conversation-meta">
                        {context?.subject ?? "General"} • {formatConversationDate(meta)}
                      </span>
                    </Link>
                  );
                })}
              </div>
            </div>
          </div>
        </aside>

        <main className="workspace-chat-panel">
          <div className="workspace-panel-header">
            <h2>Chat</h2>
            <div className="workspace-panel-meta">
              <span className="topic-pill">{activeStudyContext?.subject ?? "General"}</span>
              <span className="workspace-meta-text">
                {activeConversation ? `${renderedMessages.length} messages` : "Ready to begin"}
              </span>
            </div>
          </div>

          <section className="workspace-chat-body">
            {routeConversationId === null ? (
              <div className="notebook-empty-state">
                <div className="notebook-empty-intro">
                  <div className="notebook-empty-icon">◌</div>
                  <h2>{activeStudyContext?.topic ?? "What should we work on?"}</h2>
                  <p>
                    Start with a question or choose one of the guided prompts below. The tutor
                    should lead with questions, not shortcuts.
                  </p>
                </div>

                <div className="prompt-grid">
                  {QUICK_PROMPTS.map((prompt) => (
                    <button
                      className="prompt-card"
                      key={prompt}
                      onClick={() => setDraft(prompt)}
                      type="button"
                    >
                      {prompt}
                    </button>
                  ))}
                </div>
              </div>
            ) : null}

            {routeConversationId !== null && activeConversationQuery.isLoading ? (
              <div className="thread-feedback">
                <p className="muted">Loading conversation…</p>
              </div>
            ) : null}

            {routeConversationId !== null && activeConversationQuery.isError ? (
              <div className="thread-feedback">
                <p className="error-text">Failed to load the selected conversation.</p>
              </div>
            ) : null}

            {activeConversation ? (
              <>
                <div className="thread-summary notebook-thread-summary">
                  <span>
                    {lastSavedMessage
                      ? `Last update ${formatConversationDate(lastSavedMessage.created_at)}`
                      : `Created ${formatConversationDate(activeConversation.created_at)}`}
                  </span>
                </div>

                {retrievedSources.length > 0 ? (
                  <section className="retrieved-sources-card">
                    <div className="table-header">
                      <div>
                        <p className="rail-card-label">Used sources</p>
                        <h3>{retrievedSources.length} material excerpts</h3>
                      </div>
                    </div>

                    <div className="retrieved-sources-list">
                      {retrievedSources.map((source) => (
                        <article className="retrieved-source-item" key={`${source.chunk_id}-${source.material_id}`}>
                          <div className="retrieved-source-head">
                            <strong>{source.material_filename}</strong>
                            <span className="status-pill">
                              {source.page_number ? `Page ${source.page_number}` : "Text"}
                            </span>
                          </div>
                          <p>{source.snippet}</p>
                        </article>
                      ))}
                    </div>
                  </section>
                ) : null}

                <div className="message-list notebook-message-list" ref={messageListRef}>
                  {renderedMessages.length === 0 ? (
                    <div className="thread-feedback">
                      <p className="muted">Send the first message to begin the tutoring exchange.</p>
                    </div>
                  ) : null}

                  {renderedMessages.map((message) => (
                    <article className={`message-card role-${message.role}`} key={`${message.id}-${message.created_at}`}>
                      <div className="message-meta-row">
                        <span className="message-role">{message.role}</span>
                        <span className="message-time">{formatConversationDate(message.created_at)}</span>
                      </div>
                      <p>{message.content}</p>
                    </article>
                  ))}

                  {streamedAssistantText ? (
                    <article className="message-card role-assistant streaming">
                      <div className="message-meta-row">
                        <span className="message-role">assistant</span>
                        <span className="message-time">Streaming now</span>
                      </div>
                      <p>{streamedAssistantText}</p>
                    </article>
                  ) : null}
                </div>
              </>
            ) : null}
          </section>

          <form className="workspace-composer-shell" onSubmit={(event) => void handleSubmit(event)}>
            <div className="session-controls">
              {SESSION_CONTROLS.map((control) => (
                <button
                  className="composer-pill"
                  key={control.label}
                  onClick={() => setDraft(control.prompt)}
                  type="button"
                >
                  {control.label}
                </button>
              ))}
            </div>

            <div className="composer-pills">
              {QUICK_PROMPTS.map((prompt) => (
                <button
                  className="composer-pill"
                  key={prompt}
                  onClick={() => setDraft(prompt)}
                  type="button"
                >
                  {prompt}
                </button>
              ))}
            </div>

            <div className="composer-surface notebook-composer-surface">
              <textarea
                onChange={(event) => setDraft(event.target.value)}
                placeholder="Start typing..."
                rows={4}
                value={draft}
              />

              <div className="composer-footer">
                {streamError ? (
                  <p className="error-text">{streamError}</p>
                ) : (
                  <span className="muted">
                    {activeStudyContext?.subject ?? "General study"} • {conversationCount} saved chats
                  </span>
                )}
                <button className="button button-primary notebook-send-button" disabled={!draft.trim() || isStreaming} type="submit">
                  {isStreaming ? "Streaming…" : "Send"}
                </button>
              </div>
            </div>
          </form>
        </main>
      </div>
    </div>
  );
}
