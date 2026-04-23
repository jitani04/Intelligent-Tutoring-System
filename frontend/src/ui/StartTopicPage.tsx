import { FormEvent, useState } from "react";
import { Link, useNavigate } from "react-router-dom";

import { getPendingStudyContext, setPendingStudyContext } from "../studyState";

export function StartTopicPage() {
  const navigate = useNavigate();
  const pendingContext = getPendingStudyContext();
  const [subject, setSubject] = useState(pendingContext?.subject ?? "");

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const nextSubject = subject.trim();
    if (!nextSubject) return;
    setPendingStudyContext({
      subject: nextSubject,
      createdAt: pendingContext?.createdAt ?? new Date().toISOString(),
    });
    navigate("/start/materials");
  }

  return (
    <div className="flow-page">
      <div className="flow-card">
        <div className="flow-step">Step 1 of 3</div>
        <h1>What are you studying?</h1>
        <p className="flow-copy">
          Give the tutor enough context to ask better questions and keep the session grounded.
        </p>

        <form className="flow-form" onSubmit={handleSubmit}>
          <label className="flow-field">
            <span>Subject</span>
            <input
              autoComplete="off"
              autoFocus
              onChange={(e) => setSubject(e.target.value)}
              placeholder="e.g. Organic Chemistry, SQL, Calculus"
              value={subject}
            />
          </label>

          <div className="flow-actions">
            <Link className="button button-secondary" to="/dashboard">Back</Link>
            <button className="button button-primary" disabled={!subject.trim()} type="submit">
              Continue
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
