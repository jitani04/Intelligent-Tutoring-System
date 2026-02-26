# FastAPI Streaming Chat Backend (Milestone 1)

Production-style async backend for chatbot streaming with PostgreSQL persistence and RAG-ready architecture.

## Features
- FastAPI + async SQLAlchemy 2.0 + PostgreSQL
- OpenAI Responses API streaming
- Server-Sent Events (`text/event-stream`)
- Strict conversation ownership via `X-User-Id`
- Alembic migrations
- RAG-ready retriever interface placeholder

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
4. Create PostgreSQL database (example):
   ```sql
   CREATE DATABASE chatbot_db;
   ```
5. Run migrations:
   ```bash
   alembic upgrade head
   ```
6. Seed a user for testing (`X-User-Id` depends on existing user rows):
   ```sql
   INSERT INTO users (email) VALUES ('demo@example.com');
   ```
7. Run server:
   ```bash
   uvicorn app.main:app --reload
   ```

## API
- `POST /conversations`
- `GET /conversations/{id}`
- `POST /chat/{conversation_id}` (SSE streaming)

## Curl Examples
Create conversation:
```bash
curl -X POST http://localhost:8000/conversations \
  -H "X-User-Id: 1"
```

Get conversation:
```bash
curl http://localhost:8000/conversations/1 \
  -H "X-User-Id: 1"
```

Stream chat:
```bash
curl -N -X POST http://localhost:8000/chat/1 \
  -H "Content-Type: application/json" \
  -H "Accept: text/event-stream" \
  -H "X-User-Id: 1" \
  -d '{"message":"Hello"}'
```

## Notes
- Ownership violations return `404` to avoid leaking conversation existence.
- Retriever currently returns empty context list by design.
- This milestone intentionally excludes auth/JWT and RAG storage.
