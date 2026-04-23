import { FormEvent, useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";

import { completeOnboarding, getCurrentUser } from "../api";

const USE_CASES = [
  "Studying for a class",
  "Preparing for exams",
  "Learning a new skill",
  "Building a project",
  "Reviewing uploaded materials",
];

export function OnboardingPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { data: user } = useQuery({ queryKey: ["me"], queryFn: getCurrentUser });
  const [name, setName] = useState(user?.name ?? "");
  const [useCase, setUseCase] = useState(user?.use_case ?? "");
  const [customUseCase, setCustomUseCase] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (user?.name) {
      setName(user.name);
    }
    if (user?.use_case) {
      setUseCase(user.use_case);
    }
  }, [user?.name, user?.use_case]);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    const finalUseCase = useCase === "Other" ? customUseCase : useCase;
    setError(null);
    setLoading(true);
    try {
      const updatedUser = await completeOnboarding(name, finalUseCase);
      queryClient.setQueryData(["me"], updatedUser);
      await queryClient.invalidateQueries({ queryKey: ["me"] });
      navigate("/dashboard");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save onboarding.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flow-page onboarding-page">
      <div className="flow-card onboarding-card">
        <div className="flow-step">Welcome</div>
        <h1>Personalize your tutor</h1>
        <p className="flow-copy">
          Answer two quick questions so KnowledgePal can shape your dashboard and tutoring sessions around your goals.
        </p>

        <form className="flow-form" onSubmit={(event) => void handleSubmit(event)}>
          <label className="flow-field">
            <span>What should we call you?</span>
            <input
              autoComplete="name"
              autoFocus
              onChange={(event) => setName(event.target.value)}
              placeholder="Your name"
              required
              value={name}
            />
          </label>

          <div className="flow-field">
            <span>What are you using the app for?</span>
            <div className="onboarding-choice-grid">
              {[...USE_CASES, "Other"].map((option) => (
                <button
                  className={`onboarding-choice ${useCase === option ? "selected" : ""}`}
                  key={option}
                  onClick={() => setUseCase(option)}
                  type="button"
                >
                  {option}
                </button>
              ))}
            </div>
          </div>

          {useCase === "Other" ? (
            <label className="flow-field">
              <span>Tell us more</span>
              <input
                onChange={(event) => setCustomUseCase(event.target.value)}
                placeholder="Describe your goal"
                required
                value={customUseCase}
              />
            </label>
          ) : null}

          {error ? <p className="error-text">{error}</p> : null}

          <div className="flow-actions">
            <button className="button button-primary" disabled={loading || !useCase} type="submit">
              {loading ? "Saving..." : "Continue"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
