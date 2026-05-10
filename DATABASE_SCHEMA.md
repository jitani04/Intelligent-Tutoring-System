# Database Schema

The application uses **PostgreSQL** with **SQLAlchemy 2.0 async ORM** and **Alembic**. Semantic retrieval is implemented with **`pgvector`**, and uploaded file bytes live in S3-compatible storage while the database stores metadata and object keys.

## Tables

| Table | Purpose |
|-------|---------|
| `users` | Authentication, onboarding, and tutor customization |
| `conversations` | A single study session owned by a user |
| `messages` | Individual turns in a conversation |
| `materials` | Uploaded file metadata and ingestion status |
| `material_chunks` | Extracted text chunks and embeddings for retrieval |
| `quizzes` | Tutor-generated quiz questions |
| `quiz_attempts` | Student answers to quiz questions |
| `key_ideas` | Saved session notes plus flashcard scheduling fields |
| `project_profiles` | Subject-level metadata, cover image info, and persistent mind map JSON |

## ER Diagram

```mermaid
erDiagram
    USERS ||--o{ CONVERSATIONS : owns
    USERS ||--o{ MATERIALS : uploads
    USERS ||--o{ KEY_IDEAS : owns
    USERS ||--o{ PROJECT_PROFILES : owns
    USERS ||--o{ QUIZ_ATTEMPTS : makes
    CONVERSATIONS ||--o{ MESSAGES : contains
    CONVERSATIONS ||--o{ QUIZZES : has
    CONVERSATIONS ||--o{ KEY_IDEAS : produces
    MATERIALS ||--o{ MATERIAL_CHUNKS : splits_into
    QUIZZES ||--o{ QUIZ_ATTEMPTS : receives

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
        timestamptz created_at
    }

    CONVERSATIONS {
        int id PK
        int user_id FK
        string subject nullable
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
        timestamptz created_at
        timestamptz updated_at
    }
```

## Table Details

### `users`

Stores account identity and tutoring preferences.

- Email/password accounts use `password_hash`.
- Google sign-in accounts use `google_id`.
- A user may have both if an email account is later linked to Google.
- Tutor customization is stored directly on the user row:
  - `tutor_name`
  - `tutor_tone`
  - `tutor_style`
  - `tutor_instructions`

These values are appended to the tutoring prompt on each streamed chat request.

### `conversations`

Represents a single study session.

- `subject` is a free-text project label used to group sessions.
- `summary` is a cached JSON object generated on demand through `POST /conversations/{id}/summary`.

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

Stores user and assistant turns for a conversation.

- `role` uses the `message_role` enum.
- Full message history is loaded for tutoring context and summary generation.

### `materials`

Stores uploaded file metadata rather than file bytes.

- `storage_path` is the object key in S3-compatible storage.
- `status` moves through `processing`, `ready`, or `failed`.
- `error_message` stores ingestion failure details when present.

Important design note: the application no longer treats materials as local files. Uploads are browser-to-object-storage via presigned URLs, and the database stores the resulting key.

### `material_chunks`

Stores extracted retrieval units for RAG.

Each row contains:

- `content`: normalized chunk text
- `embedding`: vector representation used for cosine similarity search
- `chunk_index`: per-material chunk order
- `char_start` / `char_end`: character offsets within the extracted block
- `page_number`: page association for PDF-derived chunks when available

The current configuration uses Google embeddings with a default dimensionality of 768.

### `quizzes`

Stores tutor-generated quizzes.

- `quiz_type` is currently `multiple_choice` or `short_answer`.
- `options` is JSON for multiple-choice quizzes and `null` for short-answer quizzes.
- Every quiz belongs to exactly one conversation, including weak-area practice conversations created just for review.

### `quiz_attempts`

Stores student answers and correctness.

- `is_correct` is computed server-side by comparing the submitted answer to `correct_answer` case-insensitively.
- The `user_id` foreign key supports user-scoped progress queries and ownership checks.

### `key_ideas`

Stores both saved notes and flashcard scheduling data.

This is one of the more important schema decisions in the project: notes and flashcards are not separate entities. A key idea starts as a saved note and can immediately participate in spaced repetition.

SM-2 fields:

| Field | Meaning |
|-------|---------|
| `sr_interval` | Current interval in days |
| `sr_repetitions` | Successful review count |
| `sr_ease_factor` | Ease factor used in SM-2 updates |
| `sr_due_date` | Next scheduled review time |

### `project_profiles`

Stores subject-level metadata for a user.

- unique per `(user_id, subject)` through `uq_project_profile_user_subject`
- level and goals for the subject
- cover image metadata and attribution
- persistent `mind_map` JSON

This table does **not** store streamed session diagrams. Session diagrams are transient SSE artifacts rendered in the client, while `mind_map` is the durable visual planning artifact stored for a subject.

## What Is Not Persisted Separately

The current implementation does **not** have dedicated tables for:

- streamed chat citations
- session diagrams
- lecture-mode audio chunks
- search indexes outside the existing relational/vector tables

Those behaviors are derived at runtime from conversations, material chunks, and AI outputs.

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
| `20260502_000013_add_project_cover_image_attribution` | photographer attribution fields on `project_profiles` |
