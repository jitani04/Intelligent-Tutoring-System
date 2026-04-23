import { useState } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";
import { useMutation } from "@tanstack/react-query";

import { createConversation } from "../api";
import { clearPendingStudyContext, getPendingStudyContext } from "../studyState";

export function StartMethodPage() {
  const navigate = useNavigate();
  const pendingContext = getPendingStudyContext();
  const [error, setError] = useState<string | null>(null);

  if (!pendingContext) {
    return <Navigate replace to="/start/topic" />;
  }

  const createMutation = useMutation({
    mutationFn: () => createConversation(pendingContext.subject),
    onSuccess: (c) => {
      clearPendingStudyContext();
      navigate(`/projects/${encodeURIComponent(pendingContext.subject)}/setup?session=${c.id}`, { replace: true });
    },
    onError: () => setError("Failed to create project. Please try again."),
  });

  return (
    <div className="flow-page">
      <div className="flow-card">
        <div className="flow-step">Step 3 of 3</div>
        <h1>How this tutor will work</h1>
        <p className="flow-copy">
          You should expect a guided conversation: questions first, hints when needed, and fuller
          explanations only after the system understands where you are getting stuck.
        </p>

        <div className="method-principles">
          <div className="method-card">
            <strong>Ask first</strong>
            <span>The system should assess what you know before explaining.</span>
          </div>
          <div className="method-card">
            <strong>Hint, then explain</strong>
            <span>Use scaffolding and targeted hints before a full explanation.</span>
          </div>
          <div className="method-card">
            <strong>Stay grounded</strong>
            <span>When materials exist, the tutor should reference them instead of improvising.</span>
          </div>
        </div>

        <div className="flow-summary">
          <span>{pendingContext.subject}</span>
        </div>

        {error && <p className="error-text">{error}</p>}

        <div className="flow-actions">
          <Link className="button button-secondary" to="/start/materials">
            Back
          </Link>
          <button
            className="button button-primary"
            disabled={createMutation.isPending}
            onClick={() => createMutation.mutate()}
            type="button"
          >
            {createMutation.isPending ? "Creating…" : "Start project"}
          </button>
        </div>
      </div>
    </div>
  );
}
