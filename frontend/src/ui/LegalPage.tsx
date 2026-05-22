import { Link } from "react-router-dom";

type LegalKind = "privacy" | "terms";

interface Section {
  title: string;
  body?: string[];
  bullets?: string[];
}

interface LegalContent {
  title: string;
  updated: string;
  intro: string[];
  sections: Section[];
  contact: string;
}

const privacy: LegalContent = {
  title: "Privacy Policy",
  updated: "May 22, 2026",
  intro: [
    "This Privacy Policy explains how Sapient Agentic Tutoring System collects, uses, stores, and shares information when you use the Sapient tutoring platform.",
    "This policy is a product starting point and should be reviewed by qualified legal counsel before public launch.",
  ],
  sections: [
    {
      title: "Information We Collect",
      bullets: [
        "Account information, such as name, email address, login method, profile settings, and authentication identifiers.",
        "Study content, such as subjects, goals, uploaded course materials, chat messages, quiz answers, notes, flashcards, learning maps, assignments, calendar feeds, and review history.",
        "Voice and audio input if you use speech recognition or text-to-speech features.",
        "Usage and diagnostic information, such as browser data, logs, timestamps, feature usage, errors, and security events.",
        "Third-party connection data if you connect services such as Google OAuth, Google Drive, Canvas, calendar feeds, or email integrations.",
      ],
    },
    {
      title: "How We Use Information",
      bullets: [
        "Provide tutoring sessions, quizzes, flashcards, notes, lecture mode, search, and review planning.",
        "Ground answers in uploaded materials and subject-specific context.",
        "Generate learning maps, mastery estimates, summaries, reminders, and review digests.",
        "Authenticate users, maintain account security, debug issues, prevent abuse, and monitor system performance.",
      ],
    },
    {
      title: "AI Processing",
      body: [
        "Sapient uses third-party AI and infrastructure providers. Depending on configuration, study content may be sent to providers such as Google Gemini, Anthropic Claude, OpenAI, embedding services, reranking services, speech services, storage providers, database providers, hosting providers, and email providers.",
        "Do not upload content you do not have permission to use. Do not include highly sensitive personal, medical, financial, or legal information unless the deployment has been reviewed and approved for that use.",
      ],
    },
    {
      title: "Sharing and Service Providers",
      body: [
        "We do not sell personal information. We may share information with service providers that help operate Sapient, including hosting, database, object storage, authentication, AI model, speech, email, analytics, logging, and calendar integration providers.",
        "We may also disclose information if required by law, to protect rights and safety, to prevent fraud or abuse, or as part of a business transfer.",
      ],
    },
    {
      title: "Retention, Security, and Choices",
      body: [
        "We retain information for as long as needed to provide the service, comply with legal obligations, resolve disputes, maintain security, and enforce agreements. Users may delete certain subjects, materials, sessions, notes, and related records where deletion features are available.",
        "We use reasonable safeguards designed to protect information, but no system is completely secure.",
        "Depending on your location and the deployment, you may have rights to access, correct, delete, export, or restrict the use of your personal information.",
      ],
    },
    {
      title: "Children and Students",
      body: [
        "Sapient is not intended for children under 13 unless used with appropriate parent, guardian, school, or institutional consent and any required written agreements. Deployments involving students, minors, schools, or regulated education records should be reviewed for COPPA, FERPA, state student privacy laws, and other applicable requirements.",
      ],
    },
  ],
  contact: "Privacy questions or requests can be sent to privacy@sapient-ats.com.",
};

const terms: LegalContent = {
  title: "Terms and Conditions",
  updated: "May 22, 2026",
  intro: [
    "These Terms and Conditions govern access to and use of Sapient Agentic Tutoring System.",
    "These terms are a product starting point and should be reviewed by qualified legal counsel before public launch.",
  ],
  sections: [
    {
      title: "Acceptance",
      body: ["By accessing or using Sapient, you agree to these Terms. If you do not agree, do not use the service."],
    },
    {
      title: "Service Description",
      body: [
        "Sapient is an AI tutoring platform that supports subject-based study sessions, uploaded materials, retrieval-augmented answers, quizzes, notes, flashcards, lecture mode, calendar and assignment workflows, and review planning.",
        "Sapient is an educational support tool. It does not replace teachers, instructors, academic advisors, professional tutors, legal, medical, financial, or other professional advice.",
      ],
    },
    {
      title: "Accounts and User Content",
      body: [
        "You are responsible for maintaining the confidentiality of your account credentials and for activity under your account.",
        "You retain ownership of uploaded files, prompts, messages, subjects, notes, assignments, quiz answers, calendar data, and other content you provide.",
        "You grant Sapient a limited license to host, process, transmit, display, analyze, and create derived educational outputs from your content as needed to provide and improve the service, operate security systems, and comply with legal obligations.",
      ],
    },
    {
      title: "AI Outputs",
      body: [
        "Sapient uses AI systems that may generate inaccurate, incomplete, outdated, or misleading outputs. You are responsible for reviewing AI-generated explanations, citations, quizzes, summaries, study plans, and other outputs before relying on them.",
        "Sapient should not be used as the sole source for academic, professional, safety-critical, legal, medical, financial, or disciplinary decisions.",
      ],
    },
    {
      title: "Acceptable Use",
      bullets: [
        "Do not violate laws, school policies, platform rules, or third-party rights.",
        "Do not upload content you do not have permission to use.",
        "Do not cheat, plagiarize, impersonate others, or misrepresent AI-generated work as your own where prohibited.",
        "Do not generate harmful, abusive, discriminatory, sexual, exploitative, or unlawful content.",
        "Do not bypass security controls, rate limits, access controls, or usage restrictions.",
        "Do not reverse engineer, scrape, overload, disrupt, or interfere with the service.",
      ],
    },
    {
      title: "Third-Party Services",
      body: [
        "Sapient may rely on third-party providers for hosting, databases, storage, authentication, AI models, embeddings, reranking, speech, email, calendar feeds, and related functionality. Your use of connected third-party services may also be governed by their terms and policies.",
      ],
    },
    {
      title: "Disclaimers and Liability",
      body: [
        "The service is provided as is and as available. To the maximum extent permitted by law, Sapient disclaims warranties of merchantability, fitness for a particular purpose, title, non-infringement, accuracy, availability, and reliability.",
        "To the maximum extent permitted by law, Sapient will not be liable for indirect, incidental, special, consequential, exemplary, or punitive damages, lost profits, lost data, academic outcomes, or business interruption arising from or related to the service.",
      ],
    },
  ],
  contact: "Questions about these Terms can be sent to support@sapient-ats.com.",
};

const contentByKind: Record<LegalKind, LegalContent> = { privacy, terms };

export function LegalPage({ kind }: { kind: LegalKind }) {
  const content = contentByKind[kind];

  return (
    <main className="legal-page">
      <div className="legal-shell">
        <Link className="legal-back-link" to="/">Sapient</Link>
        <h1>{content.title}</h1>
        <p className="legal-updated">Last updated: {content.updated}</p>

        {content.intro.map((paragraph) => (
          <p key={paragraph}>{paragraph}</p>
        ))}

        {content.sections.map((section) => (
          <section className="legal-section" key={section.title}>
            <h2>{section.title}</h2>
            {section.body?.map((paragraph) => <p key={paragraph}>{paragraph}</p>)}
            {section.bullets ? (
              <ul>
                {section.bullets.map((item) => <li key={item}>{item}</li>)}
              </ul>
            ) : null}
          </section>
        ))}

        <section className="legal-section">
          <h2>Contact</h2>
          <p>{content.contact}</p>
        </section>
      </div>
    </main>
  );
}
