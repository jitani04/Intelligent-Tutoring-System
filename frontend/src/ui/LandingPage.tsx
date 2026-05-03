import { FormEvent, useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { GoogleLogin, type CredentialResponse } from "@react-oauth/google";
import { Link, Navigate, useNavigate } from "react-router-dom";

import { login, loginWithGoogle, register } from "../api";
import { isAuthenticated, setToken } from "../auth";
import type { AuthResult } from "../types";
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

type WaveLayer = {
  components: { amp: number; freq: number; speed: number; phase: number }[];
  yOffset: number;
  rgba: [number, number, number, number];
};

const AURORA_LAYERS: WaveLayer[] = [
  {
    components: [
      { amp: 0.13, freq: 1.2, speed: 0.00042, phase: 0.0 },
      { amp: 0.05, freq: 2.9, speed: 0.00080, phase: 1.4 },
    ],
    yOffset: 0.52,
    rgba: [115, 147, 179, 0.28],
  },
  {
    components: [
      { amp: 0.16, freq: 0.9, speed: 0.00031, phase: 2.2 },
      { amp: 0.06, freq: 3.4, speed: 0.00110, phase: 0.7 },
    ],
    yOffset: 0.63,
    rgba: [158, 183, 207, 0.22],
  },
  {
    components: [
      { amp: 0.11, freq: 1.6, speed: 0.00055, phase: 1.0 },
      { amp: 0.04, freq: 4.2, speed: 0.00140, phase: 3.1 },
    ],
    yOffset: 0.74,
    rgba: [90, 120, 152, 0.18],
  },
  {
    components: [
      { amp: 0.18, freq: 0.6, speed: 0.00022, phase: 3.8 },
      { amp: 0.07, freq: 2.1, speed: 0.00065, phase: 2.6 },
    ],
    yOffset: 0.82,
    rgba: [140, 165, 195, 0.14],
  },
];

function AuroraCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const el: HTMLCanvasElement = canvas;
    const c: CanvasRenderingContext2D = ctx;

    let raf = 0;
    let w = 0;
    let h = 0;

    function resize() {
      const dpr = window.devicePixelRatio || 1;
      w = el.offsetWidth;
      h = el.offsetHeight;
      el.width = w * dpr;
      el.height = h * dpr;
      c.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    function sampleY(layer: WaveLayer, time: number, x: number): number {
      return (
        h * layer.yOffset +
        layer.components.reduce((acc, comp) => {
          return acc + Math.sin((x / w) * Math.PI * 2 * comp.freq + comp.phase + time * comp.speed) * h * comp.amp;
        }, 0)
      );
    }

    function draw(time: number) {
      c.clearRect(0, 0, w, h);

      for (const layer of AURORA_LAYERS) {
        const [r, g, b, a] = layer.rgba;
        const grad = c.createLinearGradient(0, 0, 0, h);
        grad.addColorStop(0, `rgba(${r},${g},${b},0)`);
        grad.addColorStop(0.35, `rgba(${r},${g},${b},${a})`);
        grad.addColorStop(1, `rgba(${r},${g},${b},0)`);

        c.beginPath();
        c.moveTo(0, sampleY(layer, time, 0));
        for (let x = 1; x <= w; x += 3) {
          c.lineTo(x, sampleY(layer, time, x));
        }
        c.lineTo(w, h);
        c.lineTo(0, h);
        c.closePath();
        c.fillStyle = grad;
        c.fill();
      }

      raf = requestAnimationFrame(draw);
    }

    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(el);
    raf = requestAnimationFrame(draw);

    return () => {
      cancelAnimationFrame(raf);
      observer.disconnect();
    };
  }, []);

  return <canvas className="bb-constellation-canvas" ref={canvasRef} />;
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
            <span>BrainBoost AI</span>
          </Link>
          <div className="bb-nav-links">
            <a href="#features">Features</a>
            <a href="#how">How it works</a>
            <a href="#start">Get started</a>
          </div>
          <ThemeToggle compact />
          <button className="bb-btn bb-btn-ghost" onClick={() => openModal("signin")} type="button">Sign in</button>
          <button className="bb-btn bb-btn-primary" onClick={() => openModal("signup")} type="button">Sign up</button>
        </div>
      </nav>

      <header className="bb-hero landing-hero">
        <div className="bb-hero-inner bb-hero-inner-visual-only">
          <div className="bb-hero-visual motion-reveal motion-scale" aria-hidden="true">
            <AuroraCanvas />
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

      <footer className="bb-footer">© 2026 BrainBoost AI.</footer>

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
