import { FormEvent, type ReactNode, useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { GoogleLogin, type CredentialResponse } from "@react-oauth/google";
import { Navigate, useNavigate } from "react-router-dom";

import { login, loginWithGoogle, register } from "../api";
import { isAuthenticated, setToken } from "../auth";
import { getGoogleAuthStatus } from "../googleAuth";
import type { AuthResult } from "../types";
import { ThemeToggle } from "./ThemeToggle";
import { buttonClass } from "./buttonClass";
import ErrorMessage from "./ErrorMessage";

type ModalMode = "signin" | "signup";

function LandingDemoVideo({
  title,
  variant,
  children,
}: {
  title: string;
  variant?: string;
  children: ReactNode;
}) {
  return (
    <div className={`landing-demo-video ${variant ? `landing-demo-video-${variant}` : ""}`}>
      <div className="landing-demo-topbar">
        <span />
        <span />
        <span />
        <strong>{title}</strong>
      </div>
      <div className="landing-demo-screen">
        {children}
      </div>
      <div className="landing-demo-progress" />
    </div>
  );
}

export function LandingPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const authenticated = isAuthenticated();
  const [mode, setMode] = useState<ModalMode | null>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadingLabel, setLoadingLabel] = useState("");
  const googleClientId = import.meta.env.VITE_GOOGLE_CLIENT_ID;
  const googleAuthStatus = getGoogleAuthStatus(googleClientId);
  const busyLabel = loadingLabel || (mode === "signup" ? "Creating account…" : "Signing in…");

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
    if (loading) return;
    setEmail("");
    setPassword("");
    setError(null);
    setLoadingLabel("");
    setMode(m);
  }

  function switchMode(nextMode: ModalMode) {
    if (loading || mode === nextMode) return;
    setError(null);
    setLoadingLabel("");
    setMode(nextMode);
  }

  async function handleAuthResult(result: AuthResult) {
    setToken(result.access_token);
    queryClient.setQueryData(["me"], result.user);
    await queryClient.invalidateQueries({ queryKey: ["me"] });
    navigate(result.user.onboarding_complete ? "/dashboard" : "/onboarding");
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoadingLabel(mode === "signup" ? "Creating account…" : "Signing in…");
    setLoading(true);
    try {
      const result = mode === "signup" ? await register(email, password) : await login(email, password);
      await handleAuthResult(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setLoading(false);
      setLoadingLabel("");
    }
  }

  async function handleGoogleSuccess(response: CredentialResponse) {
    if (!response.credential) {
      setError("Google did not return a credential.");
      return;
    }
    setError(null);
    setLoadingLabel(mode === "signup" ? "Creating your Google account…" : "Signing in with Google…");
    setLoading(true);
    try {
      const result = await loginWithGoogle(response.credential);
      await handleAuthResult(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Google sign-in failed.");
    } finally {
      setLoading(false);
      setLoadingLabel("");
    }
  }

  return (
    <div className="landing-shell">
      <nav className="landing-nav">
        <span className="landing-brand">
          <span className="landing-brand-logo" aria-hidden="true" />
          <span className="landing-wordmark">Sapient</span>
        </span>
        <div className="landing-nav-right">
          <ThemeToggle variant="icon" />
          <button className={buttonClass("primary")} onClick={() => openModal("signup")} type="button">
            Create account
          </button>
          <button className={buttonClass("secondary")} onClick={() => openModal("signin")} type="button">
            Sign in
          </button>
        </div>
      </nav>

      <main className="landing-main">
        <section className="landing-hero">
          {/* Decorative background */}
          <div className="landing-hero-bg" aria-hidden="true">
            <div className="landing-hero-blob landing-hero-blob-1" />
            <div className="landing-hero-blob landing-hero-blob-2" />
          </div>

          <h1 className="landing-headline motion-reveal motion-rise motion-delay-1">
            Understand more, <em>forget less</em>
          </h1>
          <p className="landing-sub motion-reveal motion-rise motion-delay-2">
            Sapient learns from your coursework, lectures, deadlines, and progress to guide what you study next.
          </p>
          <div className="landing-cta-row motion-reveal motion-rise motion-delay-3">
            <button className={buttonClass("primary")} onClick={() => openModal("signup")} type="button">
              Start your first study session
            </button>
            <button className={buttonClass("secondary")} onClick={() => openModal("signin")} type="button">
              Sign in
            </button>
          </div>
          <div className="landing-hero-demo motion-reveal motion-rise motion-delay-3" aria-hidden="true">
            <LandingDemoVideo title="Sapient study session" variant="hero">
              <div className="landing-demo-chat">
                <div className="landing-demo-message landing-demo-message-user">Explain my lecture notes on memory allocation.</div>
                <div className="landing-demo-message landing-demo-message-ai">
                  <span className="landing-demo-typing landing-demo-typing-1" />
                  <span className="landing-demo-typing landing-demo-typing-2" />
                  <span className="landing-demo-typing landing-demo-typing-3" />
                </div>
                <div className="landing-demo-source-strip">
                  <span>notes.pdf p. 4</span>
                  <span>lecture 2 slide 12</span>
                </div>
              </div>
              <div className="landing-demo-side">
                <span className="landing-demo-side-title">Upcoming deadlines</span>
                <div className="landing-demo-deadlines">
                  <div className="landing-demo-deadline">
                    <span>Due in 2 days</span>
                    <strong>Memory allocation quiz</strong>
                  </div>
                  <div className="landing-demo-deadline">
                    <span>Friday</span>
                    <strong>Systems lab report</strong>
                  </div>
                </div>
              </div>
            </LandingDemoVideo>
          </div>
        </section>

        <section className="landing-showcase landing-showcase-tinted motion-reveal motion-rise">
          <div className="landing-showcase-copy">
            <h2>Grounded in <em>your</em> materials</h2>
            <p>
              Every answer cites the page, paragraph, or slide it came from, pulled from notes
              and readings you upload, not generic web answers.
            </p>
          </div>
          <div className="landing-showcase-visual" aria-hidden="true">
            <LandingDemoVideo title="Cited answer" variant="sources">
              <div className="landing-answer-card">
              <div className="landing-answer-line landing-answer-line-1" />
              <div className="landing-answer-line landing-answer-line-2" />
              <div className="landing-answer-line landing-answer-line-3" />
              <div className="landing-source-row">
                <span className="landing-source-chip">Fine Art · slide 12</span>
                <span className="landing-source-chip">notes.pdf · p. 4</span>
              </div>
              </div>
            </LandingDemoVideo>
          </div>
        </section>

        <section className="landing-showcase landing-showcase-reverse motion-reveal motion-rise">
          <div className="landing-showcase-copy">
            <h2>Mastery, <em>modeled</em></h2>
            <p>
              Sapient tracks how well you know each concept in every subject. Every quiz answer updates
              that picture; the tutor uses it to decide what's worth revisiting next.
            </p>
          </div>
          <div className="landing-showcase-visual" aria-hidden="true">
            <LandingDemoVideo title="Mastery model" variant="mastery">
              <svg className="landing-mastery-chart" viewBox="0 0 260 140" preserveAspectRatio="none">
              <line className="landing-mastery-grid" x1="32" y1="30" x2="252" y2="30" />
              <line className="landing-mastery-grid" x1="32" y1="60" x2="252" y2="60" />
              <line className="landing-mastery-grid" x1="32" y1="90" x2="252" y2="90" />
              <rect className="landing-mastery-band" x="32" y="86" width="220" height="22" />
              <polyline
                className="landing-mastery-curve"
                points="32,112 54,106 76,98 98,92 120,82 142,72 164,58 186,48 208,42 230,38 252,34"
              />
              <line className="landing-mastery-axis" x1="32" y1="120" x2="252" y2="120" />
              <line className="landing-mastery-axis" x1="32" y1="20" x2="32" y2="120" />
              <text className="landing-mastery-tick" x="0" y="34">1.0</text>
              <text className="landing-mastery-tick" x="0" y="92">0.5</text>
              <text className="landing-mastery-tick" x="0" y="122">0.0</text>
              <text className="landing-mastery-xtick" x="32" y="134">Day 1</text>
              <text className="landing-mastery-xtick" x="142" y="134">Day 7</text>
              <text className="landing-mastery-xtick" x="252" y="134" textAnchor="end">Day 14</text>
              </svg>
              <div className="landing-mastery-legend">
                <span className="landing-legend-dot landing-legend-dot-band" />
                needs-review band (mastery &lt; 0.62)
              </div>
            </LandingDemoVideo>
          </div>
        </section>

        <section className="landing-showcase landing-showcase-tinted motion-reveal motion-rise">
          <div className="landing-showcase-copy">
            <h2>The right video, at the right <em>moment</em></h2>
            <p>
              When you're stuck, or when you ask, the tutor recommends a YouTube tutorial or web
              article inline, with a one-line reason it'll help you right now. Every resource saves
              to a per-subject Resources tab so the list grows as you study.
            </p>
          </div>
          <div className="landing-showcase-visual" aria-hidden="true">
            <LandingDemoVideo title="Recommended resources" variant="resources">
              <div className="landing-resource-stack">
              <div className="landing-resource-card">
                <div className="landing-resource-thumb">
                  <span className="landing-resource-play">▶</span>
                </div>
                <div className="landing-resource-body">
                  <span className="landing-resource-kind">Video · youtube.com</span>
                  <span className="landing-resource-title">CSS Grid in 12 minutes</span>
                  <span className="landing-resource-reason">A visual run-through clears up how columns and rows interact.</span>
                </div>
              </div>
              <div className="landing-resource-card landing-resource-card-article">
                <div className="landing-resource-body">
                  <span className="landing-resource-kind">Article · css-tricks.com</span>
                  <span className="landing-resource-title">A Complete Guide to CSS Grid</span>
                  <span className="landing-resource-reason">The canonical reference once you have the basics.</span>
                </div>
              </div>
              </div>
            </LandingDemoVideo>
          </div>
        </section>

        <section className="landing-showcase landing-showcase-reverse motion-reveal motion-rise">
          <div className="landing-showcase-copy">
            <h2>Quizzes that <em>track</em> what they ask</h2>
            <p>
              Multiple-choice and short-answer questions generated mid-chat as concept checks. Each
              attempt updates your mastery score, so the next "what should I review?" answer is built
              from real evidence, not guesses. Write your own questions too and they join the same
              pool.
            </p>
          </div>
          <div className="landing-showcase-visual" aria-hidden="true">
            <LandingDemoVideo title="Quiz checkpoint" variant="quiz">
              <div className="landing-quiz-card">
              <span className="landing-quiz-tag">Multiple choice · SQL</span>
              <p className="landing-quiz-q">Which join returns rows with no match on the right side?</p>
              <div className="landing-quiz-option landing-quiz-option-correct">LEFT JOIN</div>
              <div className="landing-quiz-option">INNER JOIN</div>
              <div className="landing-quiz-option">RIGHT JOIN</div>
              <div className="landing-quiz-mastery">
                <span>Mastery: SQL · LEFT JOIN</span>
                <div className="landing-quiz-mastery-bar"><span style={{ width: "73%" }} /></div>
                <span>0.73</span>
              </div>
              </div>
            </LandingDemoVideo>
          </div>
        </section>

        <section className="landing-showcase landing-showcase-tinted motion-reveal motion-rise">
          <div className="landing-showcase-copy">
            <h2>Switch when one isn't <em>working</em></h2>
            <p>
              Every conversation can run on Claude, Gemini, or GPT. Pick from the chat header,
              no settings page detour. New conversations default to your last-used provider.
            </p>
          </div>
          <div className="landing-showcase-visual" aria-hidden="true">
            <div className="landing-model-stack">
              <div className="landing-model-pill">Claude</div>
              <div className="landing-model-pill landing-model-pill-active">Gemini</div>
              <div className="landing-model-pill">GPT</div>
              <div className="landing-model-hint">Picked per conversation · last-used stays default</div>
            </div>
          </div>
        </section>

        <section className="landing-loop motion-reveal motion-rise">
          <h2>You generate, you <em>curate</em></h2>
          <p>
            Save any snippet, diagram, or image from chat into your notes. Write your own quizzes
            and flashcards alongside the AI-generated ones. The system stores what you tell it to.
          </p>
        </section>

        <section className="landing-closing motion-reveal motion-rise">
          <h2>Ready when you are</h2>
          <button className={buttonClass("primary")} onClick={() => openModal("signup")} type="button">
            Start your first study session
          </button>
        </section>
      </main>

      <footer className="landing-footer">
        Sapient 2026
      </footer>

      {mode !== null && (
        <div className="landing-modal-backdrop" onClick={() => !loading && setMode(null)} role="presentation">
          <div
            className={`landing-modal ${loading ? "landing-modal-busy" : ""}`}
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-busy={loading}
          >
            <div className="landing-modal-head">
              <div>
                <h2>{mode === "signup" ? "Create your account" : "Sign in to Sapient"}</h2>
                <p className="landing-modal-sub">
                  {mode === "signup"
                    ? "Start saving your study sessions, notes, and learning progress."
                    : "Sign in to continue your study sessions."}
                </p>
              </div>
              <button className="modal-close-x" disabled={loading} onClick={() => setMode(null)} type="button">×</button>
            </div>

            <div className="google-auth-box">
              {loading ? (
                <div className="auth-loading-card" role="status" aria-live="polite">
                  <span className="auth-loading-spinner" />
                  <span>{busyLabel}</span>
                </div>
              ) : googleAuthStatus.enabled && googleClientId ? (
                <GoogleLogin
                  onError={() => setError("Google sign-in failed.")}
                  onSuccess={(response) => void handleGoogleSuccess(response)}
                  text={mode === "signup" ? "signup_with" : "signin_with"}
                  useOneTap={false}
                />
              ) : (
                <p className="muted">{googleAuthStatus.message}</p>
              )}
            </div>

            <div className="modal-divider"><span>or use email</span></div>

            <form className="modal-form" onSubmit={(e) => void handleSubmit(e)}>
              <div className="modal-field">
                <label>Email</label>
                <input
                  className="modal-input"
                  type="email"
                  required
                  autoComplete="email"
                  placeholder="you@example.com"
                  value={email}
                  disabled={loading}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>
              <div className="modal-field">
                <label>Password</label>
                <input
                  className="modal-input"
                  type="password"
                  required
                  autoComplete={mode === "signup" ? "new-password" : "current-password"}
                  placeholder="Enter your password"
                  value={password}
                  disabled={loading}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </div>

              <ErrorMessage message={error} />

              <div className="modal-actions">
                <button className={buttonClass("secondary")} disabled={loading} onClick={() => setMode(null)} type="button">Cancel</button>
                <button className={buttonClass("primary")} disabled={loading} type="submit">
                  {loading ? busyLabel : mode === "signup" ? "Create account" : "Sign in"}
                </button>
              </div>
              <p className="auth-mode-switch">
                {mode === "signup" ? "Already have an account?" : "New here?"}{" "}
                <button
                  disabled={loading}
                  onClick={() => switchMode(mode === "signup" ? "signin" : "signup")}
                  type="button"
                >
                  {mode === "signup" ? "Sign in" : "Create an account"}
                </button>
              </p>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
