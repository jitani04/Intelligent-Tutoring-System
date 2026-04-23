import { useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { useMutation, useQueryClient } from "@tanstack/react-query";

import { generateMindMap, setupProject } from "../api";

const LEVELS = [
  { value: "beginner", label: "Complete beginner", description: "Little to no prior experience" },
  { value: "some", label: "Some experience", description: "I know the basics but have gaps" },
  { value: "intermediate", label: "Intermediate", description: "Comfortable with the fundamentals" },
  { value: "advanced", label: "Advanced", description: "Looking to go deeper or fill edge cases" },
];

export function ProjectSetupPage() {
  const { subject } = useParams<{ subject: string }>();
  const [searchParams] = useSearchParams();
  const decoded = decodeURIComponent(subject ?? "");
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [level, setLevel] = useState<string | null>(null);
  const [goals, setGoals] = useState("");
  const [error, setError] = useState<string | null>(null);

  const sessionId = searchParams.get("session");
  const destination = sessionId ? `/sessions/${sessionId}` : `/projects/${encodeURIComponent(decoded)}`;

  const setupMutation = useMutation({
    mutationFn: async () => {
      await setupProject(decoded, level, goals.trim() || null);
      await generateMindMap(decoded);
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["project-profile", decoded] });
      navigate(destination, { replace: true });
    },
    onError: () => setError("Something went wrong. You can still continue to the project."),
  });

  function handleSkip() {
    navigate(destination, { replace: true });
  }

  return (
    <div className="flow-page">
      <div className="flow-card setup-card">
        <div className="setup-agent-bubble">
          <div className="setup-agent-avatar">KP</div>
          <div className="setup-agent-text">
            <p>
              Before we dive into <strong>{decoded}</strong>, I'd love to understand where you're
              starting from and what you're hoping to achieve. This helps me pitch the right level
              of questions and build a learning map for you.
            </p>
            <p className="setup-agent-sub">This only takes a minute — or skip if you'd rather jump straight in.</p>
          </div>
        </div>

        <div className="setup-question">
          <div className="setup-question-label">What's your current level with {decoded}?</div>
          <div className="setup-level-grid">
            {LEVELS.map((l) => (
              <button
                key={l.value}
                className={`setup-level-option ${level === l.value ? "selected" : ""}`}
                onClick={() => setLevel(l.value)}
                type="button"
              >
                <span className="setup-level-label">{l.label}</span>
                <span className="setup-level-desc">{l.description}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="setup-question">
          <div className="setup-question-label">What are your goals for this project?</div>
          <textarea
            className="setup-textarea"
            placeholder={`e.g. "Prepare for my database exam", "Build a side project", "Fill gaps in my knowledge"`}
            rows={3}
            value={goals}
            onChange={(e) => setGoals(e.target.value)}
          />
        </div>

        {error && <p className="error-text">{error}</p>}

        <div className="flow-actions">
          <button className="button button-secondary" onClick={handleSkip} type="button">
            Skip for now
          </button>
          <button
            className="button button-primary"
            disabled={setupMutation.isPending || (!level && !goals.trim())}
            onClick={() => setupMutation.mutate()}
            type="button"
          >
            {setupMutation.isPending ? "Setting up…" : "Set up project →"}
          </button>
        </div>
      </div>
    </div>
  );
}
