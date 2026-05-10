# Sapient: A Retrieval-Augmented Intelligent Tutoring System

## Abstract

Sapient is a full-stack intelligent tutoring system designed to support active study rather than one-off question answering. The platform combines conversational tutoring, retrieval-augmented generation (RAG) over student-provided materials, inline formative assessment, spaced-repetition review, and multimodal interaction through diagrams and voice. The system is implemented with a FastAPI backend, a React frontend, PostgreSQL with `pgvector`, Google Gemini for tutoring and structured generation, and OpenAI speech services for transcription and audio playback. Its core architectural goal is to turn tutoring sessions into durable learning artifacts: conversations generate quizzes, key ideas, summaries, flashcards, and project-level progress signals that can be revisited over time. This write-up presents the motivation, design, implementation, and current limitations of the system as implemented in the repository.

**Keywords:** intelligent tutoring systems, retrieval-augmented generation, spaced repetition, educational AI, FastAPI, React, pgvector

## 1. Introduction

Many AI learning tools behave like generic chat assistants: they answer questions quickly, but they do not preserve learning structure, track misconceptions, or build a usable study history. Sapient was built to address that gap. The system treats tutoring as a stateful workflow centered on subjects, study sessions, and review artifacts rather than as a sequence of disconnected prompts.

The project is designed around three assumptions:

1. Students benefit more from guided learning than direct answer delivery.
2. Study sessions are more valuable when they produce reusable artifacts such as notes, quizzes, and review prompts.
3. Answers are stronger when grounded in the learner's own uploaded materials instead of relying only on the base model.

## 2. Problem Statement and Goals

The system aims to solve a practical study problem: how to provide personalized AI tutoring that remains grounded, organized, and useful across multiple sessions.

The main goals of the project are:

- provide subject-based conversational tutoring
- ground tutor responses in uploaded study materials
- generate formative checks during study, not only after it
- preserve important concepts as notes and flashcards
- identify weak areas and support targeted review
- support multiple interaction modes, including voice and lecture-style learning

## 3. System Overview

Sapient is organized around **subjects** and **study sessions**.

- A **subject** acts as a project container with a level, goals, materials, cover image, mind map, and progress indicators.
- A **study session** is a conversation between the student and the tutor.
- During a session, the tutor can produce quizzes, key ideas, summaries, citations, and diagrams.
- After a session, the student can revisit notes, flashcards, search results, summaries, and weak-area practice.

This structure gives the application a longer-lived educational memory than a standard chatbot interface.

## 4. Technical Architecture

### 4.1 Frontend

The frontend is implemented in React 19 with TypeScript and Vite. It is responsible for:

- authentication-aware routing
- project and session navigation
- streamed chat rendering via Server-Sent Events
- file upload orchestration
- quiz, note, and flashcard interfaces
- project dashboards and history views
- lecture mode, microphone input, and speech playback

TanStack React Query is used for client-server data synchronization, and React Router handles protected navigation across the app.

### 4.2 Backend

The backend is implemented in FastAPI with SQLAlchemy 2.0 async ORM and Alembic migrations. It provides:

- JWT-based authentication
- Google OAuth sign-in verification
- conversation and project APIs
- streaming tutoring responses
- material ingestion and retrieval
- search, summaries, quizzes, flashcards, and progress aggregation

The backend also controls the structured tutoring actions that let the model create persistent learning artifacts.

### 4.3 Database and Storage

The system uses PostgreSQL for relational data and `pgvector` for semantic retrieval over uploaded materials. File uploads are stored in S3-compatible object storage rather than directly in the database or application filesystem. The database stores metadata and object keys, while the object store holds the original files.

## 5. AI and Retrieval Design

### 5.1 Tutor generation

Tutor responses are generated with Google Gemini through the LangChain Google GenAI integration. Each chat request is composed from:

- a system prompt
- subject context when available
- user-specific tutor customization settings
- prior conversation history
- retrieved study-material context when available

This design allows the tutor to adapt both to the learner and to the current subject.

### 5.2 Retrieval-augmented generation

Uploaded PDF, TXT, and Markdown files are processed into semantic chunks. Each chunk is embedded and stored in the `material_chunks` table with its vector representation. At chat time, the system:

1. embeds the user's query
2. filters materials by ownership and optional subject
3. ranks chunks by cosine similarity
4. limits overrepresentation from any one material
5. injects the best matches into the prompt as contextual sources

The retrieved chunks are also streamed back to the frontend as citation metadata so the interface can display sources to the student.

### 5.3 Structured tutoring actions

The tutoring layer exposes three internal structured actions to the model:

- `generate_quiz`
- `save_key_idea`
- `create_diagram`

These actions are important because they let the tutor produce data objects, not just text. Quizzes and key ideas are persisted to the database, while diagrams are streamed to the client as Excalidraw-compatible payloads for immediate rendering.

## 6. Implemented Features

### 6.1 Personalized tutoring

Users can customize tutor name, tone, style, and freeform instructions. These settings are appended to the tutor prompt so the teaching style can vary by learner preference without changing the rest of the system design.

### 6.2 Session-based chat with streaming output

The main tutor interface uses SSE streaming. The frontend receives incremental assistant tokens and structured events such as:

- `start`
- `token`
- `sources`
- `quiz`
- `key_idea`
- `diagram`
- `end`
- `error`

This gives the product a more interactive study workflow than a standard request-response chat.

### 6.3 Material upload, preview, and grounding

Material upload is implemented as a presigned direct-to-object-storage flow:

1. the frontend requests a presigned URL
2. the browser uploads the file directly
3. the backend records the material and starts ingestion
4. the material is marked `processing`, `ready`, or `failed`

Ready materials can be previewed through a signed GET URL and used for retrieval grounding during chat.

### 6.4 Inline quizzes and weak-area practice

The tutor can generate inline quizzes during a session. Student answers are stored and evaluated server-side. Separately, the project layer can generate targeted weak-area quizzes using prior summaries and failed quiz attempts, producing a dedicated practice conversation and quiz set.

### 6.5 Key ideas and notes

Important concepts can be saved as key ideas during a tutoring session. These notes appear in the session artifact panel and on the dedicated notes page, where they can be filtered, searched, deleted, or promoted for immediate review.

### 6.6 Spaced-repetition flashcards

Key ideas double as flashcards using SM-2 scheduling fields. The system tracks repetition count, interval, ease factor, and next due date, allowing the notes generated during tutoring to become part of a long-term revision workflow.

### 6.7 Session summaries and project progress

Session summaries are generated on demand and cached on the conversation. These summaries capture covered topics, struggled concepts, key concepts, and next-review suggestions. Project progress is then computed from the aggregate of sessions, summaries, and quiz attempts.

### 6.8 Mind maps and diagrams

The system supports two different visual representations:

- **session diagrams**, which are streamed during chat as Excalidraw-style diagrams and rendered immediately in the UI
- **project mind maps**, which are generated through a dedicated endpoint and stored on the `project_profiles` table as JSON

This distinction matters because diagrams are ephemeral session artifacts, while mind maps are subject-level persistent planning artifacts.

### 6.9 Voice and lecture mode

The system supports:

- speech-to-text with OpenAI Whisper
- text-to-speech with OpenAI `tts-1-hd`
- a lecture overlay that turns a tutoring session into a guided notebook-style experience
- optional browser-native continuous speech recognition for hands-free follow-up questions

Lecture mode buffers streamed tutor text into shorter audio chunks and plays them sequentially while collecting notes and diagrams in a live notebook view.

### 6.10 Search and review

The search interface queries across:

- prior session messages
- saved notes
- uploaded material chunks

This gives the learner a way to recover earlier ideas and study context without manually opening each session.

## 7. Data Model

The major persisted entities are:

- `users`: authentication, onboarding, and tutor preferences
- `conversations`: subject-scoped study sessions
- `messages`: user and assistant turns within a session
- `materials`: uploaded files and ingestion status
- `material_chunks`: extracted chunk text plus embeddings
- `quizzes`: tutor-generated quiz questions
- `quiz_attempts`: student responses and correctness
- `key_ideas`: saved notes and flashcard scheduling data
- `project_profiles`: subject-level settings, cover image metadata, and mind maps

This schema supports both short-term tutoring interactions and long-term review behavior.

## 8. Deployment and Operational Design

The deployment shape is a Dockerized FastAPI backend and a static React build, both hosted on Fly.io, paired with managed Postgres on Neon and S3-compatible object storage on Cloudflare R2. External AI services (Gemini, OpenAI speech APIs, Google OAuth, Pexels) are accessed over the public internet via API keys held as platform secrets. This section records the alternatives that were considered for each component and the reasoning that produced the current design.

### 8.1 Object storage: Cloudflare R2 over AWS S3

Earlier prototypes wrote uploaded materials to the application server's local filesystem. That approach broke as soon as the server became containerized: ephemeral disks lose state on restart, and horizontal scaling is impossible because each instance can only see its own files. The system was therefore migrated to S3-compatible object storage with two providers under consideration:

- **AWS S3.** The default industry choice and the most mature object storage product, but its egress pricing of $0.09 per gigabyte makes it expensive for an application that re-reads uploaded files for retrieval, preview, and download.
- **Cloudflare R2.** S3-compatible at the API level, with comparable storage pricing and **zero egress fees**. The free tier (10 GB storage, 1 million Class A operations, 10 million Class B operations per month) is permanent rather than time-limited.

R2 was chosen because the application's workload is read-heavy on uploaded materials: every chat turn that triggers retrieval reads chunk data, and material previews and downloads pull entire files. The egress savings dominate the comparison for any non-trivial usage. The trade-off is a slightly less mature ecosystem (some advanced S3 features like Object Lambda or Glacier-class lifecycle rules are unavailable on R2), none of which are required for the current feature set.

### 8.2 Upload flow: presigned PUT URLs

A second decision concerned how the browser delivers files to object storage. Two patterns were considered:

- **Proxy-through-API.** The browser uploads to the FastAPI server, which then writes to object storage. This keeps the existing endpoint shape but doubles the bandwidth, holds large files in backend memory, and ties upload throughput to backend container resources.
- **Direct browser-to-storage uploads via presigned URLs.** The frontend requests a short-lived signed URL from the backend, uploads the file directly to the bucket, then notifies the backend to record the resulting object key.

The presigned approach was adopted because it keeps the application servers stateless with respect to file payloads, removes a memory and bandwidth bottleneck on the backend, and follows the standard production pattern for browser-uploaded user content. The cost is a more involved client flow (presign → PUT → confirm) and a CORS configuration on the bucket. Material preview is implemented symmetrically with presigned GET URLs and a forced inline `Content-Disposition`, so previews render in-browser without proxying bytes through the backend.

### 8.3 Database: Neon over Supabase, Railway, RDS, and self-hosted Postgres

The application requires PostgreSQL with the `pgvector` extension. The shortlist of providers that meet that requirement on a sustainable free or low-cost tier was:

- **Neon.** Serverless Postgres with a permanent free tier (0.5 GB storage), built-in `pgvector`, automatic scale-to-zero, and database branching for development. Idle databases cold-start in roughly one second on the next request.
- **Supabase.** Generous free tier (500 MB) with `pgvector` available, but free projects are paused after one week of inactivity and must be manually resumed. Bundles authentication, realtime, and storage products that the system already implements internally and would not use.
- **Railway.** Solid developer experience, but the free trial is credit-based rather than permanent. Steady-state cost is roughly 5 USD per month.
- **AWS RDS.** Mature and feature-rich, but starts at roughly 15 USD per month, requires Postgres 15.2+ on specific instance types to enable `pgvector`, and introduces operational complexity disproportionate to current needs.
- **Self-hosted Postgres on a Fly volume.** Free in raw compute terms but introduces ownership of backups, upgrades, and pgvector installation. For this project the operational overhead outweighs the cost savings.

Neon was chosen because the application has irregular usage patterns: it should cost nothing during long idle periods and should not require manual unpausing after a week of inactivity. The cold-start penalty is imperceptible relative to LLM and embedding API latency, and the database branching feature gives a low-cost path to test migrations against realistic data.

### 8.4 Compute platform: Fly.io for backend and frontend

For application hosting, four platforms were realistic for a single-developer free-tier project:

- **Fly.io.** Container-native, supports long-lived SSE connections, and runs both backend and static frontend on the same platform with multiple regions including `lax`. Fly removed its permanent free tier in October 2024; new accounts now receive trial credit, after which usage is billed per-second. Because the deployment configures `auto_stop_machines = "stop"`, idle machines hibernate and are not billed, so steady-state cost for a low-traffic application is typically a small fraction of full uptime pricing.
- **Google Cloud Run.** Container-native with a permanent free tier (two million requests and 360,000 GB-seconds of memory per month). Scales to zero with cold starts of one to three seconds. SSE works within Cloud Run's request timeout limits. A viable always-free alternative if predictable-zero billing matters more than developer experience.
- **Render.** Simplest UX, but the free web service spins down after 15 minutes of idle time, and the free Postgres tier expires after 90 days, forcing a separate Neon dependency anyway.
- **Vercel + Fly.** Excellent frontend developer experience and edge CDN distribution, but the frontend and backend live on different domains, which complicates CORS and OAuth configuration.
- **Self-hosted VPS.** Cheapest at scale, but requires managing TLS, OS updates, and deploys manually. Not appropriate as the first deployment.

Fly.io was chosen because it consolidates backend and frontend hosting on one platform, supports the long-lived SSE connections required by the chat endpoint without proxy buffering surprises, and can be operated entirely from the command line with reproducible Dockerfiles. With `auto_stop_machines` enabled, the expected steady-state cost for this workload is roughly one to three USD per month, well within the cost envelope of a single-developer project. Cloud Run remains a reasonable migration target if the steady-state cost ever becomes a concern, since the application's container is portable across both platforms with no code changes. The deployment shape is two Fly applications: the backend serves the FastAPI app on internal port 8000, and the frontend serves the Vite-built static bundle through `nginx` on port 80. The frontend calls the backend over the public internet, so cross-origin requests are governed by the `CORS_ALLOW_ORIGINS` setting on the backend rather than by an internal proxy.

### 8.5 Product name and public URL

The product is named **Sapient**, drawn from the Latin *sapere*, meaning *to know* or *to be wise*. The term refers in cognitive science to the capacity for conscious, deliberate reasoning that distinguishes thinking minds from mere intelligence, which directly aligns with the system's tutoring goal of building durable, reflective knowledge rather than surfacing one-shot answers.

The public URL is the Fly-provided subdomain, with the frontend at `https://sapient.fly.dev` and the backend at `https://sapient-api.fly.dev`. A custom domain was considered and deferred. The relevant trade-offs were:

- **Custom domain (e.g., `sapient.com`).** More polished for a public-facing product, future-proofs branding regardless of host changes, and supports a separation between marketing site at the apex and application at a subdomain. Costs roughly ten USD per year and requires DNS configuration alongside TLS certificate provisioning on Fly.
- **Fly-provided subdomain.** Costs nothing, requires no DNS work, and inherits Fly's TLS automatically. The application's branding still appears in the URL because the Fly app names contain the product name. Limitations are a less polished URL and dependence on Fly's continued operation of the `fly.dev` namespace.

The Fly-provided subdomain was chosen because the application is currently a single-developer project where the additional polish of a custom domain is not yet necessary. The deployment is structured so that adding a custom domain later is a cosmetic change rather than a structural one: it requires running `fly certs add` on each app, adding DNS records, updating the `CORS_ALLOW_ORIGINS` setting on the backend, the `VITE_API_BASE_URL` build argument on the frontend, the R2 bucket CORS policy, and the Google OAuth authorized origins. None of those changes touch application code.

### 8.6 Regional placement

The end-to-end latency profile of a tutoring request is dominated by two hops: the user-to-frontend hop, which is bounded by the user's connectivity, and the backend-to-database hop, which occurs on every request and often involves multiple round-trips per query. To minimize the second hop, the compute and database regions are aligned on the United States West Coast.

The chosen regions are Fly.io `lax` (Los Angeles) for both backend and frontend, Cloudflare R2 in the WNAM (Western North America) location, and Neon in `us-west-2` (Oregon). Neon does not offer a Los Angeles region, so Oregon is the closest available choice and yields a backend-to-database round-trip in the low tens of milliseconds. This places all three persistent components within the same broad geography, keeping per-request overhead low for a developer based in Los Angeles while preserving acceptable latency for users elsewhere on the West Coast and in the western United States.

## 9. Strengths of the Current Implementation

The project has several architectural strengths:

- it separates conversational tutoring from project-level learning memory
- it treats generated artifacts as first-class data
- it grounds answers in user-owned materials
- it supports multiple study modes without changing the core backend
- it uses a production-friendly object storage flow instead of proxying uploads through the API server

Most importantly, the system is designed around learning continuity. Sessions feed notes, quizzes, progress, and review systems rather than disappearing after the answer is delivered.

## 10. Limitations and Future Work

The current implementation is strong as a prototype and early product foundation, but several areas remain open for expansion:

- export flows for summaries, notes, or session transcripts
- stronger mobile optimization
- richer analytics and retention metrics
- deeper material parsing and citation fidelity
- persistence for session diagrams if long-term diagram history becomes important
- stronger evaluation workflows for tutoring quality and retrieval relevance

## 10.1 Observability and Rate Limiting

Two operational concerns were addressed together: (1) understanding the behavior of the running service in production, and (2) protecting the LLM-bound and authentication endpoints from accidental or abusive traffic.

### Observability

#### Why server-side observability is required

A reasonable first question for a single-developer web application is whether browser-side tooling — the Chrome / Firefox developer tools, the network panel, the JavaScript console — is sufficient to understand application behavior. For Sapient it is not, and the reasons generalize to most LLM-bound applications.

Browser developer tools see only what the browser itself observes: paint times, the duration of a network request as measured at the client, console messages, and bundle sizes. They are bounded to a single user's session, last only as long as the panel is open, and have no record of what the server did internally. For a tutoring application where a single chat request can fan out to a database, an embedding API, a vector search, an LLM stream, and a database write, the browser sees only the outer envelope: that the request took, for example, twelve seconds and returned 200. It cannot answer the operationally important question of *why* it took twelve seconds.

Server-side instrumentation answers that question directly. With distributed tracing, the same twelve-second request decomposes into a tree of spans: thirty milliseconds loading the conversation from PostgreSQL, eighty milliseconds loading the user, two hundred and forty milliseconds for the embedding call, one hundred and ten milliseconds for the vector search, eleven and a half seconds inside the LLM stream span (annotated with prompt token count, completion token count, model identifier, and whether tool calls were emitted), and a final eighty milliseconds writing the assistant response back to the database. The diagnosis follows immediately from the trace: the latency is dominated by the LLM call, the prompt is unusually large because retrieval is over-fetching, and the correct model was used. None of this is recoverable from a browser timeline.

There are also categories of behavior that browser tooling cannot observe at all. It cannot aggregate across users to distinguish a personal anomaly from a systemic regression; it cannot aggregate over time to support post-hoc analysis of yesterday's complaint; it cannot run in production where the data and load actually exist; it has no notion of alerting; it does not survive the user closing the tab; it sees a single HTTP call rather than the distributed work that call triggers; and it captures nothing about background processes such as the asynchronous material-ingestion path. These are the tasks for which an instrumented backend exists, and each of them is in scope for a tutoring application that depends on a third-party LLM whose latency, cost, and failure modes are part of the user experience. Browser developer tools and a server-side observability stack are therefore complementary rather than alternatives: developer tools remain the right instrument for client-side concerns such as paint, hydration, and bundle size, while OpenTelemetry covers the entire backend call graph that DevTools cannot see.

#### Implementation

The system was instrumented for full three-signal observability — distributed traces, metrics, and structured logs that share a common correlation identifier — using OpenTelemetry as the data plane. OpenTelemetry was chosen because it is the de facto open standard for instrumentation in modern back-end services and because it decouples the instrumented application from the chosen telemetry backend: the same SDK can export to Jaeger, Tempo, Honeycomb, Grafana Cloud, Datadog, or any other OTLP-compatible system without code changes.

**Traces.** An ASGI-level middleware (`ObservabilityMiddleware`) assigns every HTTP request a `X-Request-ID` (accepted from upstream or generated as a UUID), binds the ID into a `ContextVar`, and emits a structured JSON log line at request completion. Distributed tracing itself is provided by four OpenTelemetry instrumentations: `FastAPIInstrumentor` produces an `http.server` span per request annotated with the matched route template, `SQLAlchemyInstrumentor` and `AsyncPGInstrumentor` produce DB spans for every query, and `HTTPXClientInstrumentor` produces client spans for outbound calls (the Whisper, OpenAI TTS, and Pexels APIs). Manual spans are added inside `LLMService.stream_response` and `LLMService.stream_with_tools` and annotated with the OpenTelemetry GenAI semantic conventions (`gen_ai.system`, `gen_ai.request.model`, `gen_ai.usage.input_tokens`, `gen_ai.usage.output_tokens`), so per-call latency, token consumption, and tool-call rate are queryable as first-class span attributes. The middleware is intentionally implemented as a pure ASGI wrapper rather than a Starlette `BaseHTTPMiddleware` because the chat endpoint streams long-lived Server-Sent Events and `BaseHTTPMiddleware` is known to buffer streaming bodies in certain configurations.

**Metrics.** Metrics flow through the same OpenTelemetry `MeterProvider`, which is configured with two readers: a `PrometheusMetricReader` that backs the `/metrics` scrape endpoint, and a `PeriodicExportingMetricReader` that pushes the same data over OTLP/HTTP to any configured collector. The FastAPI instrumentor automatically emits `http.server.request.duration` and `http.server.active_requests`. Three application-specific counters — `rate_limit_rejections_total{bucket}`, `llm_calls_total{model,status}`, and `llm_tokens_total{model,kind}` — record the policy events that matter for capacity planning: which buckets are pressured, which model is being called, whether calls are succeeding, and how prompt and completion tokens are accumulating per model.

**Logs.** Logs are emitted as JSON to stdout. A `TraceContextLogFilter` reads the active OpenTelemetry span at log time and stamps `trace_id` and `span_id` onto every `LogRecord`, so each log line carries the correlation identifiers needed to navigate from a log entry to the corresponding span and back. The same fields (`trace_id`, `span_id`, `request_id`, `user_id`) appear consistently across application logs, the per-request log line emitted by the middleware, and any exception traces.

*Alternatives considered.* A first iteration used `prometheus-client` directly with no tracing, on the reasoning that the application was a single-process deployment and that Prometheus alone would be sufficient. That position was revisited and rejected: an LLM-tutoring application has a fan-out call graph (request → DB → retriever → embedding API → LLM stream → DB writes) where the most useful operational question is "where did this slow request spend its time," and that question is only answerable with traces. A hosted APM (Datadog, Sentry Performance, New Relic) was rejected on cost and lock-in grounds at the current scale; using OpenTelemetry preserves the option to point at any of those systems later by changing one environment variable. A push-only setup using StatsD/DogStatsD was rejected because it requires running an agent process for any backend to be useful, and because the OpenTelemetry pull-and-push hybrid means the application can be scraped locally during development and exported to a collector in production with a single configuration change. Computing latency histograms from logs alone (e.g., Loki + LogQL `quantile_over_time`) was rejected because it is lossy at the percentiles that matter for an LLM application and significantly more expensive than first-class metric histograms. The instrumentation-package footprint (api, sdk, OTLP HTTP exporter, Prometheus reader, four instrumentation libraries) was accepted as a deliberate cost of the standardization benefit.

### Rate limiting

#### Why rate limiting is required

An LLM-bound application has a property that traditional web applications do not: the marginal cost of a single request is non-trivial and is denominated in tokens billed by an external provider. A modest tutoring conversation may consume several thousand prompt tokens and several hundred completion tokens per turn, and the cost is incurred whether the request originates from a legitimate user, a buggy client that retries on every keystroke, or an automated script. Without an explicit policy, a single misbehaving caller can exhaust both the application's monthly LLM budget and the throughput of the upstream API, degrading service for every other user.

Rate limiting is therefore a substantive operational requirement rather than a defensive afterthought. It serves three distinct goals in this system. The first is cost containment: per-user limits on the chat, weak-quiz, summary, and mind-map endpoints place a hard ceiling on how much LLM spend any individual account can drive in a given minute, which makes per-user cost predictable and bounds the blast radius of a runaway client. The second is upstream protection: the Whisper, OpenAI text-to-speech, and Google embedding APIs each enforce their own quotas, and submitting more requests than those quotas allow produces cascading 429s and degraded latency for all users; bounding outbound rate locally avoids that failure mode. The third is authentication abuse: the `/auth/login`, `/auth/register`, and `/auth/google` endpoints are reachable without credentials and are therefore the natural target for credential stuffing and account enumeration. Per-IP throttling makes online password attacks materially more expensive without requiring CAPTCHA or other interactive friction.

These goals motivate three concrete design choices that the implementation reflects. Limits are *per principal* rather than per route — a single user calling chat repeatedly should be throttled even when the global request rate is low. Limits are *segmented by bucket* — a user uploading a large set of materials should not deplete the budget for their chat session, because uploads and chat answer different operational questions. And limits are *observable* — every rejection increments a counter that flows into the same Grafana stack as the rest of the metrics, so that limit pressure is visible alongside latency and error rate rather than being silently absorbed.

#### Implementation

An in-memory token-bucket limiter is exposed as two FastAPI dependency factories: `rate_limit_user` (keyed by JWT subject, falling back to client IP if no valid token is presented) and `rate_limit_ip` (used by the unauthenticated `/auth/login`, `/auth/register`, and `/auth/google` endpoints). Buckets are named (`chat`, `stt`, `tts`, `summary`, `upload`, `auth`), per-minute capacities are configurable through environment variables, and rejected requests return `429 Too Many Requests` with a computed `Retry-After` header and increment the `rate_limit_rejections_total{bucket}` counter so that limit pressure is observable in Grafana alongside everything else.

*Alternatives considered.* A Redis-backed limiter (`slowapi`, `fastapi-limiter`) would survive multi-process deployments and is the correct choice once the backend horizontally scales, but the application currently runs as a single Fly.io process and adding Redis purely for rate limiting would introduce a new piece of infrastructure for no current benefit. A reverse-proxy-level limit (Fly.io edge or Cloudflare) was rejected because it cannot key on the authenticated user ID and would conflate users behind shared NATs. Per-route hardcoded limits inside each handler were rejected as harder to audit than a single configuration surface; the dependency-factory approach keeps the limit declarations adjacent to the route definitions while centralizing the policy. The decision to keep the limiter in-memory is therefore explicitly time-bound: it is appropriate for the single-process deployment and should be replaced with a Redis-backed implementation when a second worker is added.

## 11. Conclusion

Sapient demonstrates a practical architecture for an educational AI system that goes beyond generic chat. By combining conversational tutoring, retrieval grounding, structured artifact generation, spaced repetition, and voice interaction, the platform creates a more complete study environment. Its main contribution is not any single feature in isolation, but the way those features are connected: tutoring sessions generate reusable learning artifacts, those artifacts drive review and progress, and the system gradually builds a personalized study workspace for the learner over time.
