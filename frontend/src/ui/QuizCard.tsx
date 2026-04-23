import { useState } from "react";

import { submitQuizAttempt } from "../api";
import type { AttemptResult, QuizData } from "../types";

interface Props {
  quiz: QuizData;
  onAnswered?: (result: AttemptResult, answer: string) => void;
}

export function QuizCard({ quiz, onAnswered }: Props) {
  const [selected, setSelected] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [result, setResult] = useState<AttemptResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit() {
    if (!selected.trim() || submitted) return;
    setLoading(true);
    setError(null);
    try {
      const res = await submitQuizAttempt(quiz.quiz_id, selected);
      setResult(res);
      setSubmitted(true);
      onAnswered?.(res, selected);
    } catch {
      setError("Failed to submit. Try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="quiz-card">
      <div className="quiz-header">
        <span className="quiz-badge">Knowledge Check</span>
      </div>

      <p className="quiz-question">{quiz.question}</p>

      {quiz.quiz_type === "multiple_choice" && quiz.options ? (
        <div className="quiz-options">
          {quiz.options.map((opt) => {
            let cls = "quiz-option";
            if (submitted && result) {
              if (opt === result.correct_answer) cls += " quiz-option-correct";
              else if (opt === selected && !result.is_correct) cls += " quiz-option-wrong";
            } else if (opt === selected) {
              cls += " quiz-option-selected";
            }
            return (
              <button
                key={opt}
                className={cls}
                disabled={submitted}
                onClick={() => setSelected(opt)}
                type="button"
              >
                {opt}
              </button>
            );
          })}
        </div>
      ) : (
        <textarea
          className="quiz-input"
          disabled={submitted}
          onChange={(e) => setSelected(e.target.value)}
          placeholder="Type your answer…"
          rows={3}
          value={selected}
        />
      )}

      {error && <p className="error-text">{error}</p>}

      {!submitted && (
        <button
          className="button button-primary quiz-submit"
          disabled={!selected.trim() || loading}
          onClick={() => void handleSubmit()}
          type="button"
        >
          {loading ? "Checking…" : "Submit answer"}
        </button>
      )}

      {result && (
        <div className={`quiz-result ${result.is_correct ? "quiz-result-correct" : "quiz-result-wrong"}`}>
          <div className="quiz-result-header">
            {result.is_correct ? "✓ Correct!" : "✗ Not quite"}
          </div>
          {!result.is_correct && (
            <div className="quiz-result-answer">
              Correct answer: <strong>{result.correct_answer}</strong>
            </div>
          )}
          <div className="quiz-result-explanation">{result.explanation}</div>
        </div>
      )}
    </div>
  );
}
