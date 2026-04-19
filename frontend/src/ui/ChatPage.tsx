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
import type { ChatStreamEvent, Conversation, Message } from "../types";
import { HealthBadge } from "./HealthBadge";

const QUICK_PROMPTS = [
  "Quiz me on this topic instead of giving the answer immediately.",
  "Explain the concept step by step, then check my understanding.",
  "Give me a hint first and wait for my attempt.",
];

const SESSION_CONTROLS = [
  {
    label: "I'm stuck",
    prompt: "I'm stuck. Give me one targeted hint without revealing the final answer.",
  },
  {
    label: "Explain differently",
    prompt: "Explain the idea differently and connect it to a simple analogy.",
  },
  {
    label: "Move on",
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
  const workspaceTitle = activeStudyContext?.topic ?? (activeConversation ? `Conversation #${activeConversation.id}` : "New tutoring chat");

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

    if (event.event === "error") {
      setStreamError(event.data.error);
    }
  }

  return (
    <div className="chat-workspace">
      <aside className="chat-rail">
        <div className="rail-header">
          <Link className="rail-brand" to="/">
            <span className="rail-brand-mark">KP</span>
            <span>
              <strong>KnowledgePal</strong>
              <small>Tutoring workspace</small>
            </span>
          </Link>

          <p className="rail-copy">
            The session view now matches the PRD more closely: topic context, history access,
            material shortcuts, and in-session tutoring controls.
          </p>

          <div className="rail-actions">
            <button
              className="button button-primary"
              disabled={!isValidUserId || createConversationMutation.isPending}
              onClick={() => void handleCreateConversation()}
              type="button"
            >
              New chat
            </button>
            <Link className="button button-secondary" to="/start/topic">
              New guided start
            </Link>
          </div>
        </div>

        <section className="rail-card">
          <div className="rail-card-row">
            <span className="rail-card-label">Backend status</span>
            <HealthBadge />
          </div>

          <div className="session-facts">
            <div>
              <span className="rail-card-label">Subject</span>
              <strong>{activeStudyContext?.subject ?? "General study"}</strong>
            </div>
            <div>
              <span className="rail-card-label">Topic</span>
              <strong>{activeStudyContext?.topic ?? "Not set yet"}</strong>
            </div>
            <div>
              <span className="rail-card-label">Timer</span>
              <strong>{elapsedLabel}</strong>
            </div>
          </div>

          <label className="user-id-control">
            <span className="rail-card-label">Header user id</span>
            <input
              min={1}
              onChange={(event) => setUserIdInput(event.target.value)}
              type="number"
              value={userIdInput}
            />
          </label>

          <div className="inline-links">
            <Link className="text-link" to="/materials">
              Upload material
            </Link>
            <Link className="text-link" to="/history">
              Session history
            </Link>
          </div>
        </section>

        <section className="rail-card rail-card-fill">
          <div className="rail-card-row">
            <div>
              <p className="rail-card-label">Sessions</p>
              <h2>{conversationCount} saved chats</h2>
            </div>
          </div>

          {!isValidUserId ? <p className="muted">Enter a valid `X-User-Id` to load history.</p> : null}
          {conversationsQuery.isLoading ? <p className="muted">Loading conversations…</p> : null}
          {conversationsQuery.isError ? <p className="error-text">Failed to load conversations.</p> : null}

          <div className="conversation-list">
            {conversationsQuery.data?.length === 0 ? (
              <div className="conversation-empty">
                <p>No saved sessions yet.</p>
                <span>Create one and use the composer to start the first tutoring exchange.</span>
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
        </section>
      </aside>

      <main className="claude-main">
        <header className="claude-topbar">
          <div>
            <p className="page-kicker">Tutoring session</p>
            <h1>{workspaceTitle}</h1>
          </div>

          <div className="topic-pill-row">
            <span className="topic-pill">{activeStudyContext?.subject ?? "General"}</span>
            <span className="claude-topbar-meta">
              {activeConversation
                ? `${renderedMessages.length} saved messages`
                : "Ready to start a new Socratic session"}
            </span>
          </div>
        </header>

        <section className="claude-thread-panel">
          {routeConversationId === null ? (
            <div className="claude-empty">
              <p className="page-kicker">Tutor conversations</p>
              <h2>{activeStudyContext?.topic ?? "What should we work on?"}</h2>
              <p>
                Start from the composer below or use one of these prompts. A new conversation will
                be created automatically on first send.
              </p>

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
              <div className="thread-summary">
                <span>{renderedMessages.length} messages</span>
                <span>
                  {lastSavedMessage
                    ? `Last update ${formatConversationDate(lastSavedMessage.created_at)}`
                    : `Created ${formatConversationDate(activeConversation.created_at)}`}
                </span>
              </div>

              <div className="message-list" ref={messageListRef}>
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

        <form className="claude-composer" onSubmit={(event) => void handleSubmit(event)}>
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

          <div className="composer-surface">
            <textarea
              onChange={(event) => setDraft(event.target.value)}
              placeholder="Ask a question, request a hint, or test the tutoring response stream…"
              rows={4}
              value={draft}
            />

            <div className="composer-footer">
              {streamError ? (
                <p className="error-text">{streamError}</p>
              ) : (
                <span className="muted">
                  Enter sends through the backend after you submit. Shift+Enter support is still pending.
                </span>
              )}
              <button className="button button-primary" disabled={!draft.trim() || isStreaming} type="submit">
                {isStreaming ? "Streaming…" : "Send message"}
              </button>
            </div>
          </div>
        </form>
      </main>
    </div>
  );
}
