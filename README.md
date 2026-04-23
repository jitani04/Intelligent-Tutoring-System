# FastAPI Streaming Chat Backend (Milestone 1)

Production-style async backend for chatbot streaming with PostgreSQL persistence and RAG-ready architecture.

## Features
- FastAPI + async SQLAlchemy 2.0 + PostgreSQL
- LangChain chat model integration with Gemini
- Server-Sent Events (`text/event-stream`)
- JWT-backed account auth with email/password and Google sign-in
- Alembic migrations
- RAG-ready retriever interface placeholder

## Current Status
- Backend API is running with FastAPI and PostgreSQL persistence.
- Frontend lives in `frontend/` as a separate React + TypeScript app.
- Gemini is wired through LangChain's `ChatGoogleGenerativeAI`.
- The current schema covers users, conversations, and messages only.
- Retrieval is still a placeholder and tutoring-specific domain tables are not implemented yet.

## Project Structure
```text
app/
  main.py
  api/
  services/
  models/
  db/
  schemas/
  core/
alembic/
```

## Database Schema
See the schema reference and ER diagram in [DATABASE_SCHEMA.md](/Users/jennaitani/Downloads/Intelligent%20Tutoring%20System/DATABASE_SCHEMA.md).

## Setup
1. Create and activate Python 3.11+ virtual environment.
2. Install dependencies:
   ```bash
   pip install -r requirements.txt
   ```
3. Copy env file:
   ```bash
   cp .env.example .env
   ```
4. Add your Gemini API key, `JWT_SECRET`, and Google OAuth client ID in `.env`.
5. Create PostgreSQL database (example):
   ```sql
   CREATE DATABASE chatbot_db;
   ```
6. Run migrations:
   ```bash
   alembic upgrade head
   ```
7. Run server:
   ```bash
   uvicorn app.main:app --reload
   ```

## Full Stack Run
Backend:

```bash
uvicorn app.main:app --reload
```

Frontend:

```bash
cd frontend
npm install
cp .env.example .env
npm run dev
```

Default local URLs:

- backend: `http://127.0.0.1:8000`
- frontend: `http://127.0.0.1:5173`

## API
- `GET /conversations`
- `POST /conversations`
- `GET /conversations/{id}`
- `POST /chat/{conversation_id}` (SSE streaming)

## Tests
Run the test suite with:

```bash
pytest -q
```

## Frontend
The repo now includes a separate React + TypeScript frontend in `frontend/`.

Run it with:

```bash
cd frontend
npm install
npm run dev
```

By default the frontend targets `http://localhost:8000`. You can override that with:

```bash
VITE_API_BASE_URL=http://localhost:8000
```

Google sign-in requires the same OAuth web client ID in both places:

```bash
# backend .env
GOOGLE_CLIENT_ID=your_google_oauth_client_id.apps.googleusercontent.com

# frontend/.env
VITE_GOOGLE_CLIENT_ID=your_google_oauth_client_id.apps.googleusercontent.com
```

## Curl Examples
Get a bearer token:
```bash
TOKEN=$(curl -s -X POST http://localhost:8000/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"demo@example.com","password":"password"}' | jq -r .access_token)
```

Create conversation:
```bash
curl -X POST http://localhost:8000/conversations \
  -H "Authorization: Bearer $TOKEN"
```

Get conversation:
```bash
curl http://localhost:8000/conversations/1 \
  -H "Authorization: Bearer $TOKEN"
```

Stream chat:
```bash
curl -N -X POST http://localhost:8000/chat/1 \
  -H "Content-Type: application/json" \
  -H "Accept: text/event-stream" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"message":"Hello"}'
```
## Colorway 
cobalt sky
## Notes
- Ownership violations return `404` to avoid leaking conversation existence.
- Retriever currently returns empty context list by design.
- The default LLM configuration targets Gemini through LangChain's `ChatGoogleGenerativeAI`.
