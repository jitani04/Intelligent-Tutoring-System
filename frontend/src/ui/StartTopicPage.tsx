import { FormEvent, useState } from "react";
import { Link, useNavigate } from "react-router-dom";

import { getPendingStudyContext, setPendingStudyContext } from "../studyState";

export function StartTopicPage() {
  const navigate = useNavigate();
  const pendingContext = getPendingStudyContext();
  const [subject, setSubject] = useState(pendingContext?.subject ?? "");
  const [topic, setTopic] = useState(pendingContext?.topic ?? "");

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const nextSubject = subject.trim();
    const nextTopic = topic.trim();
    if (!nextSubject || !nextTopic) {
      return;
    }

    setPendingStudyContext({
      subject: nextSubject,
      topic: nextTopic,
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
              onChange={(event) => setSubject(event.target.value)}
              placeholder="Organic chemistry"
              value={subject}
            />
          </label>

          <label className="flow-field">
            <span>Topic</span>
            <input
              autoComplete="off"
              onChange={(event) => setTopic(event.target.value)}
              placeholder="Acid-base titration curves"
              value={topic}
            />
          </label>

          <div className="flow-actions">
            <Link className="button button-secondary" to="/">
              Back
            </Link>
            <button className="button button-primary" disabled={!subject.trim() || !topic.trim()} type="submit">
              Continue
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
