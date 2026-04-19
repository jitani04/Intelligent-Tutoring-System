# Tutoring Specialization Plan

## Recommendation

Do not start by fine-tuning on raw teacher transcripts.

For this project, the right order is:

1. Define tutoring behavior clearly in the system prompt.
2. Add retrieval so the model can use lesson content, examples, and hint sequences.
3. Add student state and learning context to each turn.
4. Build evals from good tutoring transcripts.
5. Fine-tune later only if prompting and retrieval still produce repeated failures.

Fine-tuning is useful for consistency, style, output format, and instruction-following. It is not the best first tool for grounding the tutor in curriculum content or current student context.

## Why Not Fine-Tune First

Raw teacher transcripts are noisy.

They often contain:

- classroom management language that does not belong in product behavior
- inconsistent pedagogy across teachers
- overly long explanations
- content that gives away answers too early
- outdated or curriculum-specific references that should be retrieved dynamically

If those transcripts are used directly for training, the model can learn the wrong habits.

## Best Use of Teacher Transcripts

Use transcripts in three stages:

1. Evaluation set
   Measure whether the model asks diagnostic questions, gives appropriate hints, adapts to level, and avoids jumping to the final answer.

2. Prompt examples
   Extract a small number of high-quality examples that demonstrate the tutoring style you want.

3. Fine-tuning dataset later
   Only after cleaning and converting the transcripts into high-quality input/output pairs that reflect the exact tutor behavior you want in production.

## What To Add In This Codebase

### 1. Tutoring Policy Prompt

Extend the prompt logic so the assistant behaves like a tutor rather than a generic chatbot.

The policy should include rules such as:

- ask one focused question at a time when diagnosing understanding
- prefer hints and scaffolding before full solutions
- adapt explanations to the learner's level
- check understanding after important steps
- use retrieved curriculum content when available
- be explicit about misconceptions and why they are incorrect

Primary file:

- `app/services/prompt_builder.py`

### 2. Retrieval

Replace the empty retriever stub with a real retrieval layer.

The retriever should fetch:

- lesson notes
- worked examples
- rubric snippets
- common misconceptions
- hint ladders
- concept definitions

Primary file:

- `app/services/retriever.py`

### 3. Student State

Add structured tutoring context per conversation or session.

Useful fields:

- subject
- topic
- target skill
- grade level
- current mastery estimate
- recent mistakes
- preferred hint level
- learning goal for the session

This state should be included in the system context for each model call.

Likely files to extend:

- `app/models/conversation.py`
- `app/schemas/conversation.py`
- `app/services/chat_service.py`
- `app/services/prompt_builder.py`

### 4. Evals

Before any fine-tuning, create a small eval set from strong tutoring examples.

Score responses on:

- correctness
- pedagogical quality
- appropriate hinting
- misconception handling
- level matching
- brevity and clarity
- avoidance of answer dumping

## Suggested Architecture

For each chat turn:

1. Identify the learner context and target skill.
2. Retrieve relevant curriculum and tutoring guidance.
3. Build a tutoring-specific system prompt with student state.
4. Generate a response that follows the tutoring policy.
5. Persist the exchange and update the learner state later.

This means specialization should come mostly from:

- prompt design
- retrieval
- structured learner state
- evaluation

Fine-tuning is optional and should come after those pieces are working.

## When Fine-Tuning Does Make Sense

Consider supervised fine-tuning only if you observe repeated failures after retrieval and prompt improvements, such as:

- the tutor ignores your required pedagogy
- the tutor uses the wrong tone or structure too often
- the tutor fails to follow hint progression reliably
- prompts become too large and expensive because too many examples are needed inline

If you fine-tune, do not use raw transcripts directly. First convert them into cleaned examples with:

- the exact input context the model should see
- the exact target response the model should produce
- consistent pedagogy and formatting

## Practical Next Steps

1. Upgrade `app/services/prompt_builder.py` with a tutoring policy and student-state section.
2. Implement real retrieval in `app/services/retriever.py`.
3. Add conversation-level tutoring metadata to the schema and database.
4. Create a small eval set from strong teacher examples.
5. Reassess whether fine-tuning is still necessary after those changes.
