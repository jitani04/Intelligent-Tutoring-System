import { Link, Navigate, useNavigate } from "react-router-dom";

import { getPendingStudyContext } from "../studyState";

export function StartMethodPage() {
  const navigate = useNavigate();
  const pendingContext = getPendingStudyContext();

  if (!pendingContext) {
    return <Navigate replace to="/start/topic" />;
  }

  return (
    <div className="flow-page">
      <div className="flow-card">
        <div className="flow-step">Step 3 of 3</div>
        <h1>This tutor is supposed to push the learning back onto you.</h1>
        <p className="flow-copy">
          It should ask first, probe your thinking, correct misconceptions, and only explain more
          directly after real effort. That is the product behavior the PRD is asking for.
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
          <span>{pendingContext.topic}</span>
        </div>

        <div className="flow-actions">
          <Link className="button button-secondary" to="/start/materials">
            Back
          </Link>
          <button className="button button-primary" onClick={() => navigate("/sessions/new")} type="button">
            Start session
          </button>
        </div>
      </div>
    </div>
  );
}
