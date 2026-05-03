# Feature Roadmap

| # | Feature | Status |
|---|---------|--------|
| 1 | Quiz / Knowledge Check | ✅ Implemented |
| 2 | Session Summary | ✅ Implemented |
| 3 | Progress Tracking | ✅ Implemented |
| 4 | Key Ideas / Notes | ✅ Implemented |
| 5 | Mind Map (Excalidraw) | ✅ Implemented |
| 6 | Spaced Repetition Flashcards | ✅ Implemented |
| 7 | Material Viewer | ✅ Implemented |
| 8 | Export | ⬜ Planned |
| 9 | Search | ✅ Implemented |
| 10 | Voice Input | ✅ Implemented |
| 11 | Session Timer + Pomodoro | ✅ Implemented |
| 12 | Weak Area Quizzes | ✅ Implemented |
| 13 | Key Ideas Dedicated Page | ✅ Implemented |
| 14 | Onboarding Tour | ⬜ Planned |
| 15 | Mobile Layout | ⬜ Planned |

---

## Priority 1 — Quiz / Knowledge Check Tool ✅ Implemented

**What it does:** The agent generates inline quizzes during a session. The student answers, gets immediate feedback with an explanation, and the result feeds into progress tracking and weak-area detection.

**Agent tool:** `generate_quiz(question, type, options, correct_answer, explanation)`
- `type`: `"multiple_choice"` | `"short_answer"`

**Backend**
- `Quiz` model: `id`, `conversation_id`, `question`, `quiz_type`, `options` (JSON), `correct_answer`, `explanation`, `created_at`
- `QuizAttempt` model: `id`, `quiz_id`, `user_id`, `answer`, `is_correct`, `attempted_at`
- `POST /quizzes/{quiz_id}/attempt` — submits answer, returns `is_correct`, `correct_answer`, `explanation`
- `GET /conversations/{id}/quizzes` — all quizzes for a session
- Tool-calling loop in `app/services/chat_service.py` dispatches `generate_quiz` calls during streaming

**Frontend**
- `QuizCard` in [frontend/src/ui/QuizCard.tsx](frontend/src/ui/QuizCard.tsx) renders inline in the chat thread
- Multiple choice: clickable option buttons; short answer: text input
- On submit: reveals correct/incorrect with explanation, sends a follow-up message reflecting the outcome
- Historical quizzes re-loaded on conversation fetch; new quizzes streamed via SSE `quiz` events

**Key files:** `app/models/quiz.py`, `app/api/routes/quiz.py`, `app/services/chat_service.py`, `frontend/src/ui/QuizCard.tsx`

---

## Priority 2 — Session Summary ✅ Implemented

**What it does:** After a session the agent generates a structured summary of what was covered, what the student struggled with, and what to review next.

**Backend**
- `Conversation.summary` stores a JSON object:
  ```json
  {
    "covered": ["topic A", "topic B"],
    "struggled_with": ["concept C"],
    "key_concepts": ["A is..."],
    "next_review": ["topic D"]
  }
  ```
- `POST /conversations/{id}/summary` — calls the LLM with full history, persists and returns the summary
- Auto-triggered after ≥ 10 messages

**Frontend**
- Summary displayed in the History page ([frontend/src/ui/HistoryPage.tsx](frontend/src/ui/HistoryPage.tsx)) per session
- `next_review` items surfaced as "pick up where you left off" hints on the project page

**Key files:** `app/api/routes/conversations.py`, `app/models/conversation.py`, `frontend/src/ui/HistoryPage.tsx`

---

## Priority 3 — Progress Tracking ✅ Implemented

**What it does:** Shows quiz accuracy, concepts covered, and weak areas per subject on the project detail page.

**Backend**
- `GET /projects/{subject}/progress` — aggregates `QuizAttempt` pass rates and `struggled_with` from summaries
- No extra models — built on `QuizAttempt` and `Conversation.summary`

**Frontend**
- Project page ([frontend/src/ui/ProjectPage.tsx](frontend/src/ui/ProjectPage.tsx)) shows quiz pass rate, total quizzes, and weak concepts
- "Practice weak areas" button on the project page triggers Feature 12

**Key files:** `app/api/routes/projects.py`, `frontend/src/ui/ProjectPage.tsx`

---

## Priority 4 — Key Ideas / Notes ✅ Implemented

**What it does:** The agent saves important concepts to a running notes list as the session progresses. Reviewable via the Notes panel in chat and the dedicated `/notes` page.

**Agent tool:** `save_key_idea(concept, summary)` — called when a definition clicks or a misconception is corrected

**Backend**
- `KeyIdea` model: `id`, `user_id`, `conversation_id`, `subject`, `concept`, `summary`, `created_at` + SR fields (see Feature 6)
- `GET /conversations/{id}/key-ideas` — all key ideas for a session
- `DELETE /key-ideas/{id}` — remove a note

**Frontend**
- Notes panel toggleable from the chat topbar (renders in `ArtifactsPanel`)
- SSE `key_idea` events push new notes live during streaming
- Full notes grid at `/notes` (Feature 13)

**Key files:** `app/models/key_idea.py`, `app/api/routes/artifacts.py`, `frontend/src/ui/ArtifactsPanel.tsx`

---

## Priority 5 — Mind Map (Excalidraw) ✅ Implemented

**What it does:** The agent generates visual concept diagrams stored per session. Rendered with the Excalidraw SDK in a fullscreen card.

**Agent tool:** `generate_diagram(title, excalidraw_json)` — called when a structural overview would help

**Backend**
- `ProjectProfile.mind_map` (JSON) stores the Excalidraw scene for the project
- Diagram data streamed as SSE `diagram` events during chat

**Frontend**
- `DiagramCard` in [frontend/src/ui/DiagramCard.tsx](frontend/src/ui/DiagramCard.tsx) renders each diagram inline; double-click to open fullscreen via `createPortal`
- Diagrams accumulate in the chat thread per session

**Key files:** `app/models/project_profile.py`, `frontend/src/ui/DiagramCard.tsx`

---

## Priority 6 — Spaced Repetition Flashcards ✅ Implemented

**What it does:** Key ideas double as flashcards. The SM-2 algorithm schedules each card for review at increasing intervals based on recall quality (0–5).

**Backend**
- SR fields on `key_ideas`: `sr_interval` (days), `sr_repetitions`, `sr_ease_factor` (default 2.5), `sr_due_date`
- `GET /flashcards/due?subject=` — cards where `sr_due_date ≤ now`, optionally filtered by subject; returns `total_due`
- `POST /flashcards/{id}/review` — accepts `quality: 0–5`, runs SM-2, updates the card
- SM-2 logic in `app/api/routes/flashcards.py::_sm2()`

**Frontend**
- `FlashcardsPage` at `/projects/:subject/flashcards` — flip-card UI with quality rating buttons (0–5)
- Due count badge on the Flashcards sidebar link (polled every 60 s)
- `POST /key-ideas/{id}/promote` — sets `sr_due_date = now()` to surface a note for immediate review

**Key files:** `app/api/routes/flashcards.py`, `app/models/key_idea.py`, `frontend/src/ui/FlashcardsPage.tsx`

---

## Priority 7 — Material Viewer ✅ Implemented

**What it does:** Students can open uploaded materials to view extracted text chunks with page citations. The tutor can cite sources in the Sources panel.

**Backend**
- `GET /projects/{subject}/materials` and `GET /materials/{id}` — material metadata
- `MaterialChunk` stores text, `page_number`, `chunk_index`, and a `pgvector` embedding for RAG
- Sources returned as `RetrievedSource` objects (chunk_id, material_id, filename, snippet, page_number, similarity_score) on each chat SSE stream

**Frontend**
- `MaterialDetailPage` at `/projects/:subject/materials/:materialId` — renders all chunks grouped by page
- Sources panel in the chat workspace: clickable sources show filename, page, snippet, and similarity score

**Key files:** `app/api/routes/materials.py`, `app/models/material_chunk.py`, `frontend/src/ui/MaterialDetailPage.tsx`

---

## Priority 8 — Export ⬜ Planned

**What it does:** Download a session's notes, summary, and key ideas as a formatted markdown file or PDF.

**Backend**
- `GET /conversations/{id}/export?format=md|pdf` — assembles session content and returns a file download
- PDF generation via `weasyprint` or `pdfkit`; markdown is string assembly

**Frontend**
- "Export" button on the session summary panel and history page
- Dropdown: "Markdown" / "PDF"
- File download via `<a download>` with the blob response

**Dependencies:** Priority 2 (summaries) for full value

---

## Priority 9 — Search ✅ Implemented

**What it does:** Full-text search across past sessions, key ideas, and uploaded materials. Reached via `Cmd+K` or the sidebar Search link.

**Backend**
- `GET /search?q=` — ILIKE queries across `messages.content` (user role only), `key_ideas.concept + summary`, and `material_chunks.content`
- Results capped at 8 per category; material results deduplicated by `material_id`
- `_snippet()` helper extracts a ±150-char window around the match

**Response shape:**
```json
{
  "sessions": [{ "conversation_id", "subject", "message_id", "snippet", "created_at" }],
  "notes":    [{ "id", "concept", "subject", "snippet" }],
  "materials":[{ "material_id", "filename", "snippet", "page_number" }]
}
```

**Frontend**
- `SearchPage` at `/search` — debounced input (300 ms), updates `?q=` URL param, autofocuses on mount
- Results grouped by Sessions / Notes / Materials with `<mark>` highlight on matched text
- Global `Cmd+K` shortcut navigates to `/search` from anywhere in the app

**Key files:** `app/api/routes/search.py`, `frontend/src/ui/SearchPage.tsx`, `frontend/src/ui/Sidebar.tsx`

---

## Priority 10 — Voice Input ✅ Implemented

**What it does:** A mic button in the chat input bar. Press to record, press again to stop. Transcript is inserted into the text field for the user to review before sending.

**Backend**
- `POST /stt` — accepts `multipart/form-data` audio blob; calls OpenAI Whisper (`whisper-1`); returns `{ "text": "..." }`
- Reuses `OPENAI_TTS_API_KEY`; max 25 MB guard; MIME → file-extension mapping for Whisper compatibility

**Frontend**
- `useMicrophone` hook in [frontend/src/useMicrophone.ts](frontend/src/useMicrophone.ts) — `MediaRecorder`-based; `toggle()` starts/stops
- On stop: derives filename from MIME type, POSTs blob to `/stt`, appends transcript to the draft
- Mic button between textarea and send button; pulsing ring animation while recording (`@keyframes mic-pulse`)

**Key files:** `app/api/routes/stt.py`, `frontend/src/useMicrophone.ts`, `frontend/src/ui/ChatPage.tsx`

---

## Priority 11 — Session Timer + Pomodoro ✅ Implemented

**What it does:** Shows elapsed time in the chat topbar. Optional Pomodoro mode prompts a break every 25 minutes.

**Backend**
- None — purely client-side

**Frontend**
- `useSessionTimer(conversationId)` in [frontend/src/useSessionTimer.ts](frontend/src/useSessionTimer.ts):
  - Starts on first `send()` call (idempotent — won't restart if already running)
  - Persists `startedAt` timestamp to `sessionStorage` keyed as `kp-timer-{conversationId}` — survives page refresh
  - 1-second `setInterval` tick; re-hydrates from storage when conversation changes
- `MM:SS` displayed as a pill in the chat topbar while active
- Pomodoro banner appears below topbar at each 25-minute interval (`Math.floor(elapsed / 1500)`), dismissable per interval
- Pomodoro enabled/disabled toggle in Settings → Preferences → Focus mode (persisted in `localStorage` as `kp-pomodoro`)

**Key files:** `frontend/src/useSessionTimer.ts`, `frontend/src/ui/ChatPage.tsx`, `frontend/src/ui/SettingsPage.tsx`

---

## Priority 12 — Weak Area Quizzes ✅ Implemented

**What it does:** On the project page, "Practice weak areas" generates a targeted quiz from concepts the user has struggled with.

**Backend**
- `POST /projects/{subject}/weak-quiz`:
  1. Collects `struggled_with` strings from all conversation summaries for the subject
  2. Collects `question` text from failed `QuizAttempt` rows (joined via `Quiz.conversation_id`)
  3. Returns 422 if no weak signal found
  4. Builds a JSON prompt, calls the LLM, parses the returned quiz array
  5. Creates a practice `Conversation` so that `QuizAttempt` ownership checks pass
  6. Stores up to 5 `Quiz` rows; returns `{ conversation_id, quizzes }`

**Frontend**
- "Practice weak areas" button on `ProjectPage` — disabled when insufficient history
- `WeakQuizModal` ([frontend/src/ui/WeakQuizModal.tsx](frontend/src/ui/WeakQuizModal.tsx)) — `createPortal` fullscreen overlay
- One quiz at a time via `QuizCard`; tracks per-question results
- Results screen: `X / total` score, score bar, performance message

**Key files:** `app/api/routes/projects.py`, `frontend/src/ui/WeakQuizModal.tsx`, `frontend/src/ui/ProjectPage.tsx`

---

## Priority 13 — Key Ideas Dedicated Page ✅ Implemented

**What it does:** `/notes` shows all saved key ideas across every subject. Filterable by subject, searchable by keyword. Cards support delete and "Review now" (promote to flashcard).

**Backend**
- `GET /key-ideas` — all key ideas for the user, optional `?subject=` and `?q=` filters
- `POST /key-ideas/{id}/promote` — sets `sr_due_date = now(timezone.utc)` to surface for immediate flashcard review

**Frontend**
- `NotesPage` at [frontend/src/ui/NotesPage.tsx](frontend/src/ui/NotesPage.tsx) — responsive card grid (`auto-fill, minmax(280px, 1fr)`)
- Client-side subject filter pills and keyword search (no round-trip)
- `NoteCard` shows: concept, summary (4-line clamp), subject tag, creation date, SR review status label, "Review now" button for non-due cards, delete button
- Review status: "Not yet reviewed" / "Due for review" / "Next: Jan 5" based on `sr_due_date` and `sr_repetitions`
- Linked from the sidebar with ✦ icon

**Key files:** `app/api/routes/artifacts.py`, `frontend/src/ui/NotesPage.tsx`

---

## Priority 14 — Onboarding Tour ⬜ Planned

**What it does:** First-time users see a brief overlay tour highlighting the key features.

**Backend**
- `onboarding_complete` flag already exists on `User` model — no new backend needed

**Frontend**
- Lightweight step-by-step tooltip overlay (no extra library — absolute-positioned divs with a backdrop cutout)
- Steps: "Start a session here" → "Your subjects appear here" → "Review flashcards here" → "Customize your tutor in settings"
- State tracked in `localStorage`; "Restart tour" button in Settings → Preferences tab

**Dependencies:** none

---

## Priority 15 — Mobile Layout ⬜ Planned

**What it does:** Makes the app usable on phones and tablets.

**Backend**
- No backend changes needed

**Frontend**
- Sidebar: hidden off-screen on `max-width: 768px`, slides in via a hamburger toggle in the topbar
- Chat thread: full-width, input bar pinned to bottom of viewport
- Cards, flashcard page, history: single-column stacked layout on small screens
- CSS `@media` queries + a small `useMobileLayout` hook for JS-side breakpoint awareness

**Dependencies:** none; purely CSS + minor JSX changes
