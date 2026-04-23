# Feature Roadmap

## Priority 1 — Quiz / Knowledge Check Tool

**What it does:** The agent can generate a quiz inline in the chat when it wants to check understanding. The student answers, gets feedback, and the result feeds into progress tracking.

**Agent tool:** `generate_quiz(question, type, options, correct_answer, explanation)`
- `type`: `"multiple_choice"` | `"short_answer"`
- The agent calls this instead of just asking a question when it wants a structured check

**Backend**
- Implement a tool-calling loop in `chat_service.py` — currently single-pass. Needs to handle: send message → model picks tool → execute tool → model generates final response → stream
- New model: `Quiz` (id, conversation_id, question, type, options JSON, correct_answer, explanation, created_at)
- New model: `QuizAttempt` (id, quiz_id, user_id, answer, is_correct, attempted_at)
- Routes:
  - `POST /quizzes/{quiz_id}/attempt` — submit answer, returns is_correct + explanation
  - `GET /conversations/{id}/quizzes` — all quizzes in a session

**Frontend**
- `QuizCard` component renders inline in the chat thread when a message includes quiz data
- Multiple choice: radio buttons + submit; short answer: text input + submit
- On submit: POST attempt, reveal correct/incorrect with explanation
- Quiz results feed into progress (see Priority 3)

**Dependencies:** none — this is the foundation everything else builds on

---

## Priority 2 — Session Summary

**What it does:** At the end of a session (or on demand), generate a structured summary of what was covered, what the student struggled with, and what to review next. Stored in the DB, shown in History and on the Dashboard.

**Backend**
- New column: `Conversation.summary` (JSON or Text)
- Summary shape:
  ```json
  {
    "covered": ["JOINs", "GROUP BY"],
    "struggled_with": ["correlated subqueries"],
    "key_concepts": ["A JOIN combines rows...", "NULL handling in aggregates..."],
    "next_review": ["Window functions", "query optimization"]
  }
  ```
- Route: `POST /conversations/{id}/summary` — calls LLM with full history, returns and persists summary
- Trigger: manually via button, or auto after the conversation reaches ≥ 10 messages

**Frontend**
- Summary panel at the bottom of the chat thread (collapsible)
- History page shows summary per session instead of just message count
- Dashboard project card shows `next_review` from the most recent session summary as a "pick up where you left off" hint

**Dependencies:** none, but richer once quizzes exist (quiz results can be included in the summary prompt)

---

## Priority 3 — Progress That Means Something

**What it does:** Replace the session-count proxy with real signal — quiz scores, concepts marked understood, summary data.

**Backend**
- `GET /projects/{subject}/progress` — aggregates across all conversations for a subject:
  - Total quizzes attempted / passed
  - Concepts covered (from summaries)
  - Weak areas (concepts that appear in `struggled_with` across summaries)
- No new DB models needed if built on top of `QuizAttempt` and `Conversation.summary`

**Frontend**
- Dashboard project card: replace fake percentage with real quiz pass rate
- Project detail view (clicking a card): breakdown by concept, quiz history, weak areas highlighted
- Progress bar tooltip: "4 of 6 topics covered · 78% quiz accuracy"

**Dependencies:** requires Priority 1 (quizzes) and Priority 2 (summaries) to have real data

---

## Priority 4 — Key Ideas / Notes Doc

**What it does:** The agent saves important concepts to a running notes document for the project as the session progresses. The student can also trigger it manually. Reviewable anytime from the dashboard.

**Agent tool:** `save_key_idea(concept, summary)` — called when a definition clicks, a misconception is corrected, or a concept is demonstrated understood

**Backend**
- New model: `KeyIdea` (id, user_id, subject, concept, summary, source_conversation_id, created_at)
- Routes:
  - `GET /notes?subject=SQL` — all key ideas for a subject
  - `DELETE /notes/{id}`

**Frontend**
- Notes panel in the chat workspace (alongside the sources panel)
- Dedicated Notes page per project accessible from the dashboard
- Student can delete or edit individual notes
- Exportable as plain text

**Dependencies:** requires the tool-calling loop from Priority 1

---

## Priority 5 — Mind Map (Excalidraw MCP)

**What it does:** A persistent, evolving visual map of the subject that lives at the project level. The agent updates it as new subtopics are introduced. The student always has a structural view of what they know and what's left.

**Agent tool:** `update_mind_map(new_node, parent_concept, relationship)` — adds a node to the existing map

**Backend**
- MCP client integration (`mcp` Python library) — wraps Excalidraw MCP server
- New model: `MindMap` (id, user_id, subject, excalidraw_json, updated_at)
- Routes:
  - `GET /projects/{subject}/mindmap`
  - `PUT /projects/{subject}/mindmap` (internal, called by agent tool)
- Tool-calling loop routes `update_mind_map` calls through the MCP client

**Frontend**
- Excalidraw component embedded in project view on the dashboard
- Read-only in the project card, interactive in a full-screen view
- Shows visually which nodes were added in the current session (highlight)

**Dependencies:** requires Priority 1 (tool-calling loop), MCP server running locally or hosted

---

## Priority 6 — Spaced Repetition

**What it does:** Surface concepts the student got wrong or flagged as weak, at increasing intervals, so they actually stick.

**Backend**
- `SpacedRepetitionItem` (id, user_id, concept, next_review_at, interval_days, ease_factor) — SM-2 algorithm
- Created from failed quiz attempts and `struggled_with` in summaries
- `GET /review` — items due today
- Background job (or on-login check) to surface due items

**Frontend**
- Dashboard banner: "3 concepts due for review"
- Dedicated Review mode: flash card-style, feeds back into quiz attempts

**Dependencies:** Priority 1 + Priority 2

---

## Priority 7 — Material Viewer

**What it does:** When the tutor cites a source, the student can open the PDF at the exact page inline, instead of just reading the snippet.

**Backend**
- `GET /materials/{id}/page/{n}` — returns page as image or PDF range
- Store page-level metadata on `MaterialChunk` (already has `page_number`)

**Frontend**
- Sources panel: clicking a source opens a side drawer with the PDF page rendered
- Highlight the relevant passage if possible

**Dependencies:** none, but higher value once RAG retrieval is well-tuned
