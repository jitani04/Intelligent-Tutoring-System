# KnowledgePal — AI Tutoring System

A full-stack AI tutoring application. The tutor asks Socratic questions, generates quizzes, saves key ideas, builds spaced-repetition flashcards, and adapts to the student's weak areas — all in a chat interface backed by RAG over uploaded study materials.

**Colorway:** cobalt sky

## Stack

| Layer | Technology |
|-------|-----------|
| Backend | Python 3.11, FastAPI, SQLAlchemy 2.0 async |
| Database | PostgreSQL + pgvector |
| LLM | Google Gemini via LangChain (`ChatGoogleGenerativeAI`) |
| TTS / STT | OpenAI `tts-1-hd` (nova voice) / Whisper `whisper-1` |
| Migrations | Alembic |
| Frontend | React 19, TypeScript, Vite |
| UI state | TanStack React Query |
| Routing | React Router v6 |

## Implemented Features

| # | Feature | Route / Endpoint |
|---|---------|-----------------|
| 1 | Inline quizzes with SM-2 spaced repetition | `POST /quizzes/{id}/attempt` |
| 2 | Session summaries (auto after ≥ 10 messages) | `POST /conversations/{id}/summary` |
| 3 | Progress tracking per subject | `GET /projects/{subject}/progress` |
| 4 | Key ideas / notes saved by agent tool | `GET /conversations/{id}/key-ideas` |
| 5 | Excalidraw concept diagrams | streamed as SSE `diagram` events |
| 6 | Spaced repetition flashcards (SM-2) | `GET /flashcards/due`, `POST /flashcards/{id}/review` |
| 7 | Material viewer with chunk citations | `GET /projects/{subject}/materials/{id}` |
| 9 | Full-text search (`Cmd+K`) | `GET /search?q=` |
| 10 | Voice input via Whisper STT | `POST /stt` |
| 11 | Session timer + Pomodoro break reminders | client-side only |
| 12 | Weak area quizzes | `POST /projects/{subject}/weak-quiz` |
| 13 | Notes page (`/notes`) — all key ideas | `GET /key-ideas` |

See [features.md](features.md) for full specs including planned features.

## Project Structure

```
app/
  main.py                      # FastAPI app, router registration
  api/
    routes/
      auth.py                  # Email/password + Google OAuth
      chat.py                  # SSE streaming chat endpoint
      conversations.py         # CRUD + summary generation
      materials.py             # Upload, ingestion, retrieval
      artifacts.py             # Key ideas, promote to flashcard
      flashcards.py            # SM-2 due queue + review
      quiz.py                  # Submit attempt
      projects.py              # Project profile, progress, weak-quiz
      search.py                # Full-text search
      stt.py                   # Speech-to-text (Whisper)
      tts.py                   # Text-to-speech (OpenAI TTS)
  models/
    user.py
    conversation.py
    message.py
    material.py
    material_chunk.py
    quiz.py                    # Quiz + QuizAttempt
    key_idea.py                # Notes + flashcard SR fields
    project_profile.py
  services/
    chat_service.py            # Tool-calling loop + SSE stream
    material_service.py        # PDF/text chunking + embedding
    retriever.py               # pgvector cosine-similarity retrieval
    stock_image_service.py     # Pexels cover image search
  core/
    config.py                  # Settings from .env
  db/
    session.py                 # Async engine + session factory
    base.py                    # Declarative base
alembic/
  versions/                    # 13 migrations (see DATABASE_SCHEMA.md)
frontend/
  src/
    ui/                        # Page and component files
    api.ts                     # All API calls
    types.ts                   # Shared TypeScript types
    router.tsx                 # React Router config
    useSessionTimer.ts         # Session timer hook
    useMicrophone.ts           # MediaRecorder → Whisper hook
    useSpeech.ts               # TTS playback hook
    ReadingPrefsContext.tsx    # Font size / bionic reading context
```

## Database Schema

See [DATABASE_SCHEMA.md](DATABASE_SCHEMA.md) for the full ER diagram, table details, and migration history.

## Setup

### Prerequisites
- Python 3.11+
- PostgreSQL with pgvector extension
- Node.js 18+

### Backend

```bash
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
# Fill in .env — see Environment Variables below
alembic upgrade head
uvicorn app.main:app --reload
```

### Frontend

```bash
cd frontend
npm install
cp .env.example .env   # set VITE_API_BASE_URL and VITE_GOOGLE_CLIENT_ID
npm run dev
```

Default local URLs:
- Backend: `http://127.0.0.1:8000`
- Frontend: `http://127.0.0.1:5173`

## Environment Variables

```bash
# backend .env
DATABASE_URL=postgresql+asyncpg://user:pass@localhost/chatbot_db
JWT_SECRET=your_jwt_secret
GEMINI_API_KEY=your_gemini_api_key
GOOGLE_CLIENT_ID=your_google_oauth_client_id.apps.googleusercontent.com
OPENAI_TTS_API_KEY=your_openai_api_key   # used for both TTS and Whisper STT
PEXELS_API_KEY=your_pexels_api_key       # optional — for project cover image search

# frontend/.env
VITE_API_BASE_URL=http://localhost:8000
VITE_GOOGLE_CLIENT_ID=your_google_oauth_client_id.apps.googleusercontent.com
```

## API Overview

### Auth
- `POST /auth/register` — email/password signup
- `POST /auth/login` — returns JWT bearer token
- `POST /auth/google` — Google OAuth token exchange

### Conversations & Chat
- `GET /conversations` — list all sessions
- `POST /conversations` — create a session
- `GET /conversations/{id}` — session with messages
- `POST /chat/{id}` — SSE streaming chat (accepts `text/event-stream`)
- `POST /conversations/{id}/summary` — generate and persist session summary

### Materials
- `GET /projects/{subject}/materials` — list uploads for a subject
- `POST /materials/upload` — upload a file (PDF/TXT/MD)
- `GET /materials/{id}` — material with chunks

### Quizzes
- `GET /conversations/{id}/quizzes` — quizzes in a session
- `POST /quizzes/{id}/attempt` — submit answer

### Flashcards
- `GET /flashcards/due?subject=` — due cards + `total_due` count
- `POST /flashcards/{id}/review` — SM-2 update (`quality: 0–5`)

### Key Ideas
- `GET /conversations/{id}/key-ideas` — notes for a session
- `GET /key-ideas?subject=&q=` — all notes with optional filters
- `DELETE /key-ideas/{id}` — delete a note
- `POST /key-ideas/{id}/promote` — schedule for immediate flashcard review

### Projects
- `GET /projects/{subject}` — project profile
- `PUT /projects/{subject}/setup` — save level, goals, cover image
- `GET /projects/{subject}/progress` — quiz stats + weak areas
- `POST /projects/{subject}/weak-quiz` — generate targeted practice quiz
- `GET /projects/cover-images/search?query=` — Pexels image search

### Search & Voice
- `GET /search?q=` — full-text search across sessions, notes, and materials
- `POST /stt` — transcribe audio blob via Whisper
- `POST /tts` — synthesize speech via OpenAI TTS

## SSE Event Types

The `POST /chat/{id}` endpoint streams `text/event-stream` with these event types:

| Event | Payload |
|-------|---------|
| `token` | `{ "delta": "..." }` — streamed text fragment |
| `sources` | `{ "sources": [...] }` — RAG citations |
| `quiz` | `{ quiz_id, question, quiz_type, options, correct_answer, explanation }` |
| `key_idea` | `{ id, concept, summary }` |
| `diagram` | `{ id, title, excalidraw_json }` |
| `error` | `{ "error": "..." }` |

## Notes

- Ownership violations return `404` to avoid leaking resource existence.
- The SM-2 implementation resets to day 1 on quality < 3; quality ≥ 3 advances the interval with updated ease factor.
- Practice conversations (created for weak-area quizzes) are real `Conversation` rows so that `QuizAttempt` ownership checks pass on the existing submit-attempt endpoint.
- The Pomodoro timer is purely client-side — `sessionStorage` keyed by conversation ID persists across page refreshes; `localStorage` (`kp-pomodoro`) stores the enabled/disabled preference.
