# Database Schema

The application uses **PostgreSQL** with **SQLAlchemy 2.0 async ORM** and **Alembic**. Semantic retrieval is implemented with **`pgvector`**, and uploaded file bytes live in S3-compatible storage while the database stores metadata and object keys.

## Tables

| Table | Purpose |
|-------|---------|
| `users` | Authentication, onboarding, and tutor customization |
| `conversations` | A single study session owned by a user |
| `messages` | Individual turns in a conversation |
| `message_feedback` | Thumbs up/down ratings and corrective feedback on assistant messages |
| `preference_memories` | Optional pgvector-backed derived preference memory |
| `materials` | Uploaded file metadata and ingestion status |
| `material_chunks` | Extracted text chunks and embeddings for retrieval |
| `quizzes` | Tutor-generated quiz questions |
| `quiz_attempts` | Student answers to quiz questions |
| `key_ideas` | Saved session notes plus SM-2 flashcard scheduling fields |
| `project_profiles` | Subject-level metadata, cover image, mind map, BKT knowledge state |
| `calendar_feeds` | iCal/Canvas feed subscriptions |
| `assignments` | Deadline entries from calendar feeds or manual entry |
| `resources` | Inline resources (videos, articles) saved during sessions |
| `lecture_notes` | Long-form lecture notes from lecture mode |
| `pending_agent_actions` | Agent-proposed actions awaiting user approval |
| `review_digest_logs` | Record of review digest email sends |

## ER Diagram

```mermaid
erDiagram
    USERS ||--o{ CONVERSATIONS : owns
    USERS ||--o{ MATERIALS : uploads
    USERS ||--o{ KEY_IDEAS : saves
    USERS ||--o{ PROJECT_PROFILES : owns
    USERS ||--o{ CALENDAR_FEEDS : subscribes
    USERS ||--o{ ASSIGNMENTS : tracks
    USERS ||--o{ RESOURCES : saves
    USERS ||--o{ LECTURE_NOTES : writes
    USERS ||--o{ PENDING_AGENT_ACTIONS : approves
    USERS ||--o{ REVIEW_DIGEST_LOGS : receives
    USERS ||--o{ PREFERENCE_MEMORIES : accumulates
    CONVERSATIONS ||--o{ MESSAGES : contains
    CONVERSATIONS ||--o{ QUIZZES : generates
    CONVERSATIONS ||--o{ KEY_IDEAS : produces
    CONVERSATIONS ||--o{ RESOURCES : saves
    MESSAGES ||--o{ MESSAGE_FEEDBACK : receives
    MATERIALS ||--o{ MATERIAL_CHUNKS : splits_into
    QUIZZES ||--o{ QUIZ_ATTEMPTS : records
    CALENDAR_FEEDS ||--o{ ASSIGNMENTS : syncs

    USERS {
        int id PK
        string email UK
        string password_hash nullable
        string google_id UK nullable
        string name nullable
        string use_case nullable
        bool onboarding_complete
        string tutor_name
        string tutor_tone
        string tutor_style
        string tutor_instructions
        text preference_summary nullable
        timestamptz preference_summary_updated_at nullable
        timestamptz created_at
    }

    CONVERSATIONS {
        int id PK
        int user_id FK
        string subject nullable
        string title nullable
        string model nullable
        json summary nullable
        timestamptz created_at
    }

    MESSAGES {
        int id PK
        int conversation_id FK
        enum role
        text content
        timestamptz created_at
    }

    MESSAGE_FEEDBACK {
        int id PK
        int message_id FK
        int user_id FK
        int rating
        text feedback_text nullable
        text correction nullable
        string llm_reason_category nullable
        text llm_feedback_summary nullable
        text llm_derived_preference nullable
        bool llm_should_update_user_preferences nullable
        string llm_stability nullable
        text llm_caveat nullable
        string prompt_version nullable
        string model_name nullable
        string task_type nullable
        json retrieved_chunk_ids nullable
        json tool_trace nullable
        int latency_ms nullable
        timestamptz created_at
    }

    PREFERENCE_MEMORIES {
        int id PK
        int user_id FK
        int source_feedback_id FK nullable
        text derived_preference
        vector embedding nullable
        timestamptz expires_at nullable
        timestamptz created_at
    }

    MATERIALS {
        int id PK
        int user_id FK
        string filename
        text storage_path
        string mime_type
        string subject nullable
        enum status
        text error_message nullable
        timestamptz created_at
        timestamptz processed_at nullable
    }

    MATERIAL_CHUNKS {
        int id PK
        int material_id FK
        int chunk_index
        text content
        vector embedding
        int char_start
        int char_end
        int page_number nullable
        timestamptz created_at
    }

    QUIZZES {
        int id PK
        int conversation_id FK
        string concept nullable
        text question
        string quiz_type
        json options nullable
        text correct_answer
        text explanation
        timestamptz created_at
    }

    QUIZ_ATTEMPTS {
        int id PK
        int quiz_id FK
        int user_id FK
        text answer
        bool is_correct
        timestamptz attempted_at
    }

    KEY_IDEAS {
        int id PK
        int user_id FK
        int conversation_id FK
        string subject nullable
        string concept
        text summary
        int sr_interval
        int sr_repetitions
        float sr_ease_factor
        timestamptz sr_due_date
        timestamptz created_at
    }

    PROJECT_PROFILES {
        int id PK
        int user_id FK
        string subject
        string level nullable
        text goals nullable
        text cover_image_url nullable
        string cover_image_source nullable
        text cover_image_source_url nullable
        string cover_image_photographer nullable
        text cover_image_photographer_url nullable
        json mind_map nullable
        json learning_map_progress nullable
        json knowledge_state nullable
        timestamptz created_at
        timestamptz updated_at
    }

    CALENDAR_FEEDS {
        int id PK
        int user_id FK
        string name
        text url
        string subject nullable
        string source
        timestamptz last_synced_at nullable
        timestamptz created_at
        timestamptz updated_at
    }

    ASSIGNMENTS {
        int id PK
        int user_id FK
        int feed_id FK nullable
        string subject nullable
        string title
        text description nullable
        timestamptz due_at
        string source
        string source_uid nullable
        text source_url nullable
        bool completed
        timestamptz created_at
        timestamptz updated_at
    }

    RESOURCES {
        int id PK
        int user_id FK
        string subject
        int conversation_id FK nullable
        int message_id FK nullable
        string kind
        string source
        string title
        string url
        text snippet nullable
        string thumbnail_url nullable
        string topic nullable
        timestamptz created_at
    }

    LECTURE_NOTES {
        int id PK
        int user_id FK
        int conversation_id FK nullable
        string subject nullable
        string title
        json timeline
        timestamptz created_at
    }

    PENDING_AGENT_ACTIONS {
        int id PK
        int user_id FK
        int conversation_id FK nullable
        string subject nullable
        string action_type
        json payload
        text explanation
        json preview nullable
        string status
        timestamptz created_at
        timestamptz updated_at
    }

    REVIEW_DIGEST_LOGS {
        int id PK
        int user_id FK
        string subject nullable
        string trigger_type
        string status
        json metadata nullable
        text skipped_reason nullable
        string provider_message_id nullable
        string idempotency_key UK nullable
        timestamptz created_at
    }
```

## Table Details

### `users`

Stores account identity and tutoring preferences.

- Email/password accounts use `password_hash`.
- Google sign-in accounts use `google_id`.
- Tutor customization (`tutor_name`, `tutor_tone`, `tutor_style`, `tutor_instructions`) is injected into the system prompt on every chat request.
- `preference_summary` stores a short LLM-derived summary of the user's stated correction preferences, updated after thumbs-down feedback when `ENABLE_FEEDBACK_PREFERENCES=true`.

### `conversations`

Represents a single study session.

- `subject` groups sessions under a project.
- `title` is auto-generated by the tutor on first meaningful exchange.
- `model` records which LLM the session uses (`gemini-2.5-flash`, `claude-sonnet-4-6`, or `gpt-4o`). Null falls back to the `LLM_MODEL` env default.
- `summary` is a cached JSON object generated on demand.

Current summary shape:

```json
{
  "covered": ["topic A", "topic B"],
  "struggled_with": ["topic C"],
  "key_concepts": ["Concept: explanation"],
  "next_review": ["topic D"]
}
```

### `messages`

Stores user and assistant turns. `role` uses the `message_role` enum. Full history is loaded for tutoring context and summary generation.

### `message_feedback`

Stores thumbs up/down ratings for assistant messages and optional free-text corrective feedback.

- `feedback_text` and `correction` come from the student.
- LLM-generated fields (`llm_reason_category`, `llm_derived_preference`, etc.) are derived server-side.
- Run-metadata columns (`prompt_version`, `model_name`, `task_type`, etc.) are nullable so feedback still saves when run metadata is unavailable.

### `preference_memories`

Optional pgvector-backed memory for cleaned derived preferences. Gated by `ENABLE_PREFERENCE_MEMORY=true`.

- Stores `derived_preference` text, not raw complaints.
- The `embedding` vector enables semantic retrieval of relevant past preferences.
- References the source `message_feedback` row.

### `materials`

Stores uploaded file metadata rather than file bytes.

- `storage_path` is the object key in S3-compatible storage.
- `status` progresses through `processing`, `ready`, or `failed`.
- Browser uploads go directly to object storage via presigned PUT URLs; the database only stores the resulting key.

### `material_chunks`

Stores extracted retrieval units for RAG.

- `content`: normalized chunk text
- `embedding`: 768-dimensional vector (Google Generative Language embeddings) for cosine similarity search
- `chunk_index`, `char_start`, `char_end`: positional metadata
- `page_number`: page association for PDF-derived chunks

### `quizzes`

Tutor-generated quiz questions. `quiz_type` is `multiple_choice` or `short_answer`. `concept` maps the quiz to a learning-map topic for BKT mastery updates.

### `quiz_attempts`

Student answers with correctness. `is_correct` is computed server-side. Each attempt triggers a BKT mastery update via `knowledge_tracing_service`.

### `key_ideas`

Stores saved notes and SM-2 flashcard scheduling data in a single table. A key idea starts as a note and immediately participates in spaced repetition.

SM-2 fields:

| Field | Meaning |
|-------|---------|
| `sr_interval` | Current interval in days |
| `sr_repetitions` | Successful review count |
| `sr_ease_factor` | Ease factor (default 2.5) |
| `sr_due_date` | Next scheduled review time |

### `project_profiles`

Subject-level metadata, unique per `(user_id, subject)`.

- `mind_map`: persistent JSON mind map for the subject, distinct from transient session diagrams
- `learning_map_progress`: `{ [node_id]: status }` where status is `not_started | in_progress | needs_review | mastered`
- `knowledge_state`: `{ [concept_id]: { mastery, attempts, correct, params, last_observed_at } }` — the per-topic BKT state updated after every quiz attempt

### `calendar_feeds`

iCal feed subscriptions. `source` is typically `"canvas"` but is generic to support other providers. Synced on creation and on-demand via `POST /calendar-feeds/{id}/sync`.

### `assignments`

Deadline entries from calendar feeds or manual entry. `feed_id` is null for manually created assignments. The study planner reads due assignments to cross-reference with weak topics.

### `resources`

Inline resources (YouTube videos, web articles) recommended by the tutor and saved during sessions. Scoped to a subject and optionally linked to the originating conversation and message.

### `lecture_notes`

Long-form notebook entries from lecture mode. `timeline` is an ordered JSON array of typed entries mirroring the frontend `TimelineEntry` shape (`key_idea`, `diagram`, `image`) so the saved page renders exactly as the student saw it during lecture.

### `pending_agent_actions`

Agent-proposed actions (such as scheduling a review digest or creating a practice quiz) that require explicit user approval. `status` is `pending`, `approved`, or `rejected`.

### `review_digest_logs`

Audit trail for review digest email sends. `idempotency_key` prevents duplicate sends within a time window. `trigger_type` distinguishes scheduled (`cron`) from manual sends.

## What Is Not Persisted Separately

- Streamed chat citations — derived at runtime from `material_chunks`
- Session diagrams — transient SSE artifacts rendered in the client; `project_profiles.mind_map` is the durable visual artifact
- Lecture-mode audio chunks

## Migration History

| File | Change |
|------|--------|
| `20250225_000001_initial_schema` | `users`, `conversations`, `messages` |
| `20260420_000002_add_material_rag_schema` | `materials`, `material_chunks`, `pgvector` extension |
| `20260422_000003_add_user_password_hash` | `users.password_hash` |
| `20260422_000004_add_conversation_subject_topic` | `conversations.subject` |
| `20260422_000005_drop_conversation_topic` | removed redundant `topic` column |
| `20260422_000006_add_quiz_tables` | `quizzes`, `quiz_attempts` |
| `20260422_000007_add_project_profiles` | `project_profiles` |
| `20260422_000008_add_google_auth_onboarding_fields` | Google auth, onboarding, and profile fields on `users` |
| `20260423_000009_add_tutor_customization_fields` | tutor personalization fields on `users` |
| `20260423_000010_add_session_artifacts` | `key_ideas`, `conversations.summary` |
| `20260502_000011_add_project_profile_cover_image` | `project_profiles.cover_image_url` |
| `20260502_000012_add_flashcard_sr_fields` | SM-2 fields on `key_ideas` |
| `20260502_000013_add_project_cover_image_attribution` | photographer attribution on `project_profiles` |
| `20260514_000017_add_message_feedback` | `message_feedback` |
| `20260514_000018_expand_message_feedback` | feedback personalization, user preference summary, preference memory |
| `20260515_000019_add_assignments_calendar_feeds` | `calendar_feeds`, `assignments` |
| `20260516_000020_add_resources` | `resources` |
| `20260516_000021_add_lecture_notes` | `lecture_notes` |
| `20260517_000022_add_agent_actions` | `pending_agent_actions`, `review_digest_logs` |
| `20260518_000023_add_knowledge_state` | `project_profiles.knowledge_state`, `project_profiles.learning_map_progress` |
| `20260518_000024_add_conversation_model_title` | `conversations.model`, `conversations.title` |
| `20260518_000025_add_quiz_concept` | `quizzes.concept` |
