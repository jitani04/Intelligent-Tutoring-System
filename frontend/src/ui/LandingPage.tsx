import { FormEvent, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { GoogleLogin, type CredentialResponse } from "@react-oauth/google";
import { Link, Navigate, useNavigate } from "react-router-dom";

import { login, loginWithGoogle, register } from "../api";
import { isAuthenticated, setToken } from "../auth";
import type { AuthResult } from "../types";

const FEATURES = [
  {
    title: "Structured guidance",
    description: "The agent leads with questions, hints, and checkpoints instead of jumping to the answer.",
  },
  {
    title: "Course-grounded study",
    description: "Bring in notes, lecture decks, and readings so the conversation stays tied to what you are studying.",
  },
  {
    title: "Session continuity",
    description: "Return to past topics, review earlier exchanges, and keep momentum across multiple study sessions.",
  },
];

type ModalMode = "signin" | "signup";

export function LandingPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const authenticated = isAuthenticated();
  const [mode, setMode] = useState<ModalMode | null>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const googleClientId = import.meta.env.VITE_GOOGLE_CLIENT_ID;

  if (authenticated) {
    return <Navigate replace to="/dashboard" />;
  }

  function openModal(m: ModalMode) {
    setEmail(""); setPassword(""); setError(null); setMode(m);
  }

  async function handleAuthResult(result: AuthResult) {
    setToken(result.access_token);
    queryClient.setQueryData(["me"], result.user);
    await queryClient.invalidateQueries({ queryKey: ["me"] });
    navigate(result.user.onboarding_complete ? "/dashboard" : "/onboarding");
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null); setLoading(true);
    try {
      const result = mode === "signup" ? await register(email, password) : await login(email, password);
      await handleAuthResult(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setLoading(false);
    }
  }

  async function handleGoogleSuccess(response: CredentialResponse) {
    if (!response.credential) {
      setError("Google did not return a credential.");
      return;
    }

    setError(null);
    setLoading(true);
    try {
      const result = await loginWithGoogle(response.credential);
      await handleAuthResult(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Google sign-in failed.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="landing-page">
      <header className="landing-hero">
        <div className="landing-hero-stage">
          <div className="landing-visual-panel" aria-hidden="true">
            <div className="hero-scene">
              <div className="hero-stage">
                <div className="hero-grid" />
                <div className="hero-orbit orbit-one" />
                <div className="hero-orbit orbit-two" />
                <div className="hero-orbit orbit-three" />
                <div className="hero-haze haze-one" />
                <div className="hero-haze haze-two" />
                <div className="hero-haze haze-three" />
                <div className="hero-core">
                  <span className="hero-core-ring" />
                  <span className="hero-core-ring hero-core-ring-alt" />
                  <span className="hero-core-sphere" />
                </div>
              </div>
            </div>
          </div>

          <div className="landing-hero-copy">
            <span className="landing-kicker">KnowledgePal</span>
            <h1>A tutor that thinks before it answers.</h1>
            <p className="landing-summary">
              An AI agent that selects the right learning tool — quiz, diagram, or Socratic dialogue
              — based on where you're actually stuck.
            </p>
            <div className="landing-actions">
              <button className="button button-primary" onClick={() => openModal("signup")} type="button">
                Get started free
              </button>
              <button className="button button-secondary" onClick={() => openModal("signin")} type="button">
                Sign in
              </button>
            </div>
            <div className="landing-inline-links">
              <Link className="text-link" to="/materials">Upload material</Link>
              <Link className="text-link" to="/history">Session history</Link>
            </div>
          </div>
        </div>
      </header>

      <section className="landing-grid" id="features">
        {FEATURES.map((f) => (
          <article className="landing-card" key={f.title}>
            <h2>{f.title}</h2>
            <p>{f.description}</p>
          </article>
        ))}
      </section>

      {mode !== null && (
        <div className="landing-modal-backdrop" onClick={() => setMode(null)} role="presentation">
          <div
            className="landing-modal"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
          >
            <div className="landing-modal-head">
              <div>
                <span className="landing-kicker-sm">Account</span>
                <h2>{mode === "signup" ? "Create account" : "Welcome back"}</h2>
              </div>
              <button className="modal-close-x" onClick={() => setMode(null)} type="button">×</button>
            </div>

            <div className="modal-tabs-row">
              <button className={`modal-tab-btn ${mode === "signin" ? "active" : ""}`} onClick={() => setMode("signin")} type="button">
                Sign in
              </button>
              <button className={`modal-tab-btn ${mode === "signup" ? "active" : ""}`} onClick={() => setMode("signup")} type="button">
                Create account
              </button>
            </div>

            <div className="google-auth-box">
              {googleClientId ? (
                <GoogleLogin
                  onError={() => setError("Google sign-in failed.")}
                  onSuccess={(response) => void handleGoogleSuccess(response)}
                  text={mode === "signup" ? "signup_with" : "signin_with"}
                  useOneTap={false}
                />
              ) : (
                <p className="muted">Set VITE_GOOGLE_CLIENT_ID to enable Google sign-in.</p>
              )}
            </div>

            <div className="modal-divider"><span>or use email</span></div>

            <form className="modal-form" onSubmit={(e) => void handleSubmit(e)}>
              <div className="modal-field">
                <label>Email</label>
                <input
                  className="modal-input"
                  type="email" required
                  autoComplete="email"
                  placeholder="you@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>
              <div className="modal-field">
                <label>Password</label>
                <input
                  className="modal-input"
                  type="password" required
                  autoComplete={mode === "signup" ? "new-password" : "current-password"}
                  placeholder="Enter your password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </div>

              {error ? <p className="error-text">{error}</p> : null}

              <div className="modal-actions">
                <button className="button button-secondary" onClick={() => setMode(null)} type="button">Cancel</button>
                <button className="button button-primary" disabled={loading} type="submit">
                  {loading ? "Please wait…" : mode === "signup" ? "Create account" : "Sign in"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
