import { FormEvent, useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";

import { completeOnboarding, getCurrentUser, updateTutorPreferences } from "../api";
import { buttonClass } from "./buttonClass";

const USE_CASES = [
  "Studying for a class",
  "Preparing for exams",
  "Learning a new skill",
  "Learning a subject",
  "Reviewing uploaded materials",
];

const TONE_OPTIONS = ["Supportive", "Socratic", "Direct", "Encouraging", "Formal", "Casual"];
const STYLE_OPTIONS = ["Step-by-step guide", "Socratic guide", "Concise explainer", "Concept-first", "Example-driven"];

export function OnboardingPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { data: user } = useQuery({ queryKey: ["me"], queryFn: getCurrentUser });
  const [step, setStep] = useState<1 | 2>(1);
  const [name, setName] = useState(user?.name ?? "");
  const [selectedUseCases, setSelectedUseCases] = useState<string[]>([]);
  const [customUseCase, setCustomUseCase] = useState("");
  const [tutorName, setTutorName] = useState("Sapient");
  const [tutorTone, setTutorTone] = useState("Supportive");
  const [tutorStyle, setTutorStyle] = useState("Step-by-step guide");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (user?.name) setName(user.name);
    if (user?.tutor_name) setTutorName(user.tutor_name);
    if (user?.tutor_tone) setTutorTone(user.tutor_tone);
    if (user?.tutor_style) setTutorStyle(user.tutor_style);
    if (user?.use_case) {
      const saved = user.use_case
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean);
      const known = saved.filter((item) => USE_CASES.includes(item));
      const custom = saved.filter((item) => !USE_CASES.includes(item) && item !== "Other").join(", ");
      setSelectedUseCases(custom ? [...known, "Other"] : known);
      setCustomUseCase(custom);
    }
  }, [user?.name, user?.use_case, user?.tutor_name, user?.tutor_tone, user?.tutor_style]);

  function toggleUseCase(option: string) {
    setSelectedUseCases((current) =>
      current.includes(option)
        ? current.filter((item) => item !== option)
        : [...current, option],
    );
  }

  const finalUseCase = selectedUseCases
    .filter((item) => item !== "Other")
    .concat(selectedUseCases.includes("Other") && customUseCase.trim() ? [customUseCase.trim()] : [])
    .join(", ");

  function handleStep1(event: FormEvent) {
    event.preventDefault();
    if (!finalUseCase.trim()) return;
    setError(null);
    setStep(2);
  }

  async function handleStep2(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const updatedUser = await completeOnboarding(name, finalUseCase);
      await updateTutorPreferences({
        tutor_name: tutorName.trim() || "Sapient",
        tutor_tone: tutorTone,
        tutor_style: tutorStyle,
        tutor_instructions: "",
        tutor_voice: "nova",
      });
      queryClient.setQueryData(["me"], updatedUser);
      await queryClient.invalidateQueries({ queryKey: ["me"] });
      navigate("/dashboard");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save onboarding.");
    } finally {
      setLoading(false);
    }
  }

  if (step === 2) {
    return (
      <div className="flow-page onboarding-page">
        <div className="flow-card onboarding-card">
          <h1>Customize your tutor</h1>
          <p className="flow-copy">
            Shape how Sapient teaches you. You can always change these later in Settings.
          </p>
          <form className="flow-form" onSubmit={(event) => void handleStep2(event)}>
            <label className="flow-field">
              <span>Tutor name</span>
              <input
                maxLength={40}
                onChange={(e) => setTutorName(e.target.value)}
                placeholder="Sapient"
                value={tutorName}
              />
            </label>

            <div className="flow-field">
              <span>Teaching tone</span>
              <div className="onboarding-choice-grid">
                {TONE_OPTIONS.map((t) => (
                  <button
                    aria-pressed={tutorTone === t}
                    className={`onboarding-choice ${tutorTone === t ? "selected" : ""}`}
                    key={t}
                    onClick={() => setTutorTone(t)}
                    type="button"
                  >
                    {t}
                  </button>
                ))}
              </div>
            </div>

            <div className="flow-field">
              <span>Teaching style</span>
              <div className="onboarding-choice-grid">
                {STYLE_OPTIONS.map((s) => (
                  <button
                    aria-pressed={tutorStyle === s}
                    className={`onboarding-choice ${tutorStyle === s ? "selected" : ""}`}
                    key={s}
                    onClick={() => setTutorStyle(s)}
                    type="button"
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>

            {error ? <p className="error-text">{error}</p> : null}

            <div className="flow-actions">
              <button
                className={buttonClass("secondary")}
                disabled={loading}
                onClick={() => setStep(1)}
                type="button"
              >
                Back
              </button>
              <button className={buttonClass("primary")} disabled={loading} type="submit">
                {loading ? "Saving…" : "Get started"}
              </button>
            </div>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="flow-page onboarding-page">
      <div className="flow-card onboarding-card">
        <h1>Personalize your tutor</h1>
        <p className="flow-copy">
          Answer two quick questions so Sapient can shape your dashboard and study sessions around your goals.
        </p>

        <form className="flow-form" onSubmit={handleStep1}>
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
                  aria-pressed={selectedUseCases.includes(option)}
                  className={`onboarding-choice ${selectedUseCases.includes(option) ? "selected" : ""}`}
                  key={option}
                  onClick={() => toggleUseCase(option)}
                  type="button"
                >
                  {option}
                </button>
              ))}
            </div>
          </div>

          {selectedUseCases.includes("Other") ? (
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
            <button className={buttonClass("primary")} disabled={loading || !finalUseCase.trim()} type="submit">
              Next: customize tutor
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
