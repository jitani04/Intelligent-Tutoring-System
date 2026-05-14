import { FormEvent, useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { GoogleLogin, type CredentialResponse } from "@react-oauth/google";
import { Link, Navigate, useNavigate } from "react-router-dom";

import { login, loginWithGoogle, register } from "../api";
import { isAuthenticated, setToken } from "../auth";
import type { AuthResult } from "../types";
import { ShaderWallpaper } from "./ShaderWallpaper";
import { ThemeToggle } from "./ThemeToggle";

const FEATURES = [
  {
    icon: "◎",
    title: "Socratic Questioning",
    description: "The tutor asks targeted questions that guide you to the answer through active recall.",
  },
  {
    icon: "✣",
    title: "Concept Mapping",
    description: "Build connections between topics with subject maps that organize what you are learning.",
  },
  {
    icon: "↗",
    title: "Progress Tracking",
    description: "Track materials, study sessions, and subjects so each subject keeps momentum.",
  },
  {
    icon: "▤",
    title: "Grounded Practice",
    description: "Upload notes and readings so explanations can stay tied to your actual course material.",
  },
  {
    icon: "?",
    title: "Active Recall",
    description: "Practice with quizzes, hints, and checkpoints before the tutor gives full explanations.",
  },
  {
    icon: "◌",
    title: "Metacognition",
    description: "Reflect on where you are stuck and choose a better study strategy for the next step.",
  },
];

const STEPS = [
  { number: "01", title: "Upload your material", body: "Add notes, readings, or a topic you want to master." },
  { number: "02", title: "Engage actively", body: "Answer guided questions and ask for hints when you need them." },
  { number: "03", title: "Track and improve", body: "Return to subjects, review study sessions, and keep building mastery." },
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

  useEffect(() => {
    const elements = Array.from(document.querySelectorAll<HTMLElement>(".motion-reveal"));
    if (!elements.length) return;

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            entry.target.classList.add("is-visible");
            observer.unobserve(entry.target);
          }
        }
      },
      { rootMargin: "0px 0px -12% 0px", threshold: 0.16 },
    );

    for (const element of elements) {
      observer.observe(element);
    }

    return () => observer.disconnect();
  }, []);

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
    <div className="bb-landing landing-page">
      <nav className="bb-nav">
        <div className="bb-nav-inner">
          <Link className="bb-nav-logo" to="/">
            <span className="bb-logo-mark">◎</span>
            <span>Sapient</span>
          </Link>
          <div className="bb-nav-links">
            <a href="#features">Features</a>
            <a href="#how">How it works</a>
            <a href="#start">Get started</a>
          </div>
          <ThemeToggle variant="icon" />
          <button className="bb-btn bb-btn-ghost" onClick={() => openModal("signin")} type="button">Sign in</button>
          <button className="bb-btn bb-btn-primary" onClick={() => openModal("signup")} type="button">Sign up</button>
        </div>
      </nav>

      <header className="os-hero">
        <ShaderWallpaper />
        <div className="os-hero-overlay" aria-hidden="true" />
        <div className="os-hero-grid" aria-hidden="true" />

        <div className="os-hero-corner os-hero-corner-tl" aria-hidden="true">
          <span className="os-corner-dot" />
          <span>SYS · SAPIENT v1.0</span>
        </div>
        <div className="os-hero-corner os-hero-corner-tr" aria-hidden="true">
          <span>{new Date().toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" })}</span>
          <span className="os-corner-dot os-corner-dot-pulse" />
        </div>
        <div className="os-hero-corner os-hero-corner-bl" aria-hidden="true">
          <span>◇ move cursor to warp · click to ripple</span>
        </div>
        <div className="os-hero-corner os-hero-corner-br" aria-hidden="true">
          <span>◎ active learning runtime</span>
        </div>

        <div className="os-hero-stage">
          <div className="os-hero-content">
            <span className="os-hero-eyebrow">◎ Sapient OS · online</span>
            <h1 className="os-hero-title">Sapient</h1>
            <div className="os-hero-define" aria-label="Definition of Sapient">
              <span className="os-define-word">sa·pi·ent</span>
              <span className="os-define-ipa">/ˈseɪ.pi.ənt/</span>
              <span className="os-define-pos">adjective</span>
              <span className="os-define-gloss">
                possessing wisdom; able to think, reason, and learn —
                from Latin <em>sapiēns</em>, "wise, knowing."
              </span>
            </div>
            <p className="os-hero-body">
              An adaptive Socratic tutor that grounds every answer in your own materials.
              Upload notes, work through guided questions, build concept maps, and watch your
              progress compound. The wallpaper reacts to you; so does the tutor.
            </p>
            <div className="os-hero-actions">
              <button className="bb-btn bb-btn-primary bb-btn-xl" onClick={() => openModal("signup")} type="button">
                Boot up →
              </button>
              <button className="bb-btn bb-btn-ghost" onClick={() => openModal("signin")} type="button">
                Sign in
              </button>
            </div>
          </div>
        </div>
      </header>

      <section className="bb-features" id="features">
        <div className="bb-section-inner">
          <h2 className="bb-section-h2 motion-reveal motion-rise">Active learning features</h2>
          <div className="bb-feat-grid landing-grid">
            {FEATURES.map((f, index) => (
              <article
                className="bb-feat-card landing-card motion-reveal motion-card"
                key={f.title}
                style={{ transitionDelay: `${index * 65}ms` }}
              >
                <div className="bb-feat-icon">{f.icon}</div>
                <h2>{f.title}</h2>
                <p>{f.description}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="bb-how" id="how">
        <div className="bb-section-inner">
          <div className="bb-steps">
            {STEPS.map((step, index) => (
              <article
                className="bb-step motion-reveal motion-rise"
                key={step.number}
                style={{ transitionDelay: `${index * 90}ms` }}
              >
                <div className="bb-step-num">{step.number}</div>
                <h3>{step.title}</h3>
                <p>{step.body}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="bb-cta" id="start">
        <div className="bb-section-inner motion-reveal motion-rise">
          <h2>Ready to unlock your learning potential?</h2>
          <p>Start with a subject, upload material, and let the tutor guide the next question.</p>
          <button className="bb-btn bb-btn-primary bb-btn-xl" onClick={() => openModal("signup")} type="button">
            Get started free
          </button>
        </div>
      </section>

      <footer className="bb-footer">© 2026 Sapient.</footer>

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
