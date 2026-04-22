import { FormEvent, useState } from "react";
import { Link } from "react-router-dom";

const LANDING_FEATURES = [
  {
    title: "Structured guidance",
    description: "The tutor leads with questions, hints, and checkpoints instead of jumping to the answer.",
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

export function LandingPage() {
  const [isSignInOpen, setIsSignInOpen] = useState(false);

  function handleSignInSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSignInOpen(false);
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
            <p className="landing-kicker">KnowledgePal</p>
            <h1>A conversational tutor that pushes students to think before it explains.</h1>
            <p className="landing-summary">
              Start with subject context, optional course material, and a session flow that is built
              around Socratic tutoring instead of answer dumping.
            </p>

            <div className="landing-actions">
              <Link className="button button-primary" to="/sessions/new">
                Start a session
              </Link>
              <button className="button button-secondary" onClick={() => setIsSignInOpen(true)} type="button">
                Sign in
              </button>
            </div>

            <div className="landing-inline-links">
              <Link className="text-link" to="/materials">
                Upload your material
              </Link>
              <Link className="text-link" to="/history">
                View session history
              </Link>
            </div>
          </div>
        </div>
      </header>

      <section className="landing-grid" id="scope">
        {LANDING_FEATURES.map((feature) => (
          <article className="landing-card" key={feature.title}>
            <h2>{feature.title}</h2>
            <p>{feature.description}</p>
          </article>
        ))}
      </section>

      {isSignInOpen ? (
        <div className="landing-modal-backdrop" onClick={() => setIsSignInOpen(false)} role="presentation">
          <div
            aria-labelledby="signin-modal-title"
            aria-modal="true"
            className="landing-modal"
            onClick={(event) => event.stopPropagation()}
            role="dialog"
          >
            <div className="landing-modal-header">
              <div>
                <p className="landing-kicker">Account</p>
                <h2 id="signin-modal-title">Sign in to continue</h2>
              </div>
              <button
                aria-label="Close sign in modal"
                className="modal-close"
                onClick={() => setIsSignInOpen(false)}
                type="button"
              >
                ×
              </button>
            </div>

            <p className="landing-modal-copy">
              Sign in to keep your materials, session history, and study context in one place.
            </p>

            <form className="modal-form" onSubmit={handleSignInSubmit}>
              <label className="flow-field">
                <span>Email</span>
                <input autoComplete="email" placeholder="you@example.com" type="email" />
              </label>

              <label className="flow-field">
                <span>Password</span>
                <input autoComplete="current-password" placeholder="Enter your password" type="password" />
              </label>

              <div className="flow-actions">
                <button className="button button-secondary" onClick={() => setIsSignInOpen(false)} type="button">
                  Cancel
                </button>
                <button className="button button-primary" type="submit">
                  Continue
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </div>
  );
}
