import { Link } from "react-router-dom";

import { HealthBadge } from "./HealthBadge";

const LANDING_FEATURES = [
  {
    title: "Focused tutoring flow",
    description: "Keep the product narrow first: question, hint, explanation, and streamed follow-up.",
  },
  {
    title: "Session memory",
    description: "Persist conversations now so learner state and curriculum context can plug in cleanly later.",
  },
  {
    title: "Agent-ready foundation",
    description: "Add tools and LangGraph after the base chat loop, data model, and UI feel stable.",
  },
];

export function LandingPage() {
  return (
    <div className="landing-page">
      <header className="landing-hero">
        <div className="landing-hero-copy">
          <p className="landing-kicker">KnowledgePal</p>
          <h1>A conversational tutor that pushes students to think before it explains.</h1>
          <p className="landing-summary">
            Start with subject context, optional course material, and a session flow that is built
            around Socratic tutoring instead of answer dumping.
          </p>

          <div className="landing-actions">
            <Link className="button button-primary" to="/start/topic">
              Start a session
            </Link>
            <Link className="button button-secondary" to="/materials">Upload your material</Link>
          </div>
        </div>

        <div className="landing-status-card">
          <div className="landing-status-header">
            <span>Current build</span>
            <HealthBadge />
          </div>

          <dl className="landing-facts">
            <div>
              <dt>Frontend</dt>
              <dd>React + TypeScript + Vite</dd>
            </div>
            <div>
              <dt>Backend</dt>
              <dd>FastAPI + Postgres + streaming chat</dd>
            </div>
            <div>
              <dt>Model path</dt>
              <dd>LangChain wrapper over Gemini</dd>
            </div>
          </dl>
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

      <section className="landing-roadmap">
        <div>
          <p className="landing-kicker">Milestone 1</p>
          <h2>What this UI should help you answer</h2>
        </div>

        <div className="landing-roadmap-copy">
          <p>
            The PRD requires four clear product surfaces: landing, onboarding, primary session chat,
            and dedicated views for materials and session history.
          </p>
          <p>
            The current frontend now reflects that structure, even though parts like document
            ingestion and topic-aware persistence are still scaffolded locally.
          </p>
        </div>
      </section>
    </div>
  );
}
