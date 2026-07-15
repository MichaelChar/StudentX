// Attempt scoring. `questions` carry display-space `.correct` (the index into
// the shuffled options); `answers[i]` is the chosen display-option index, or
// null if unanswered. `scoring` (optional) is the test's negative-marking
// config `{ correct, wrong }` — e.g. +0.2 / −0.05.
//
// Shared by ScoreSummary (headline percent) and TestPlayer's saved-attempt
// record so the two never drift.

export function countCorrect(questions, answers) {
  return questions.reduce((acc, q, i) => acc + (answers[i] === q.correct ? 1 : 0), 0);
}

// Weighted percentage when `scoring` is present, otherwise plain
// correct ÷ total. Always an integer in [0, 100].
export function scorePercent(questions, answers, scoring) {
  const total = questions.length;
  const correct = countCorrect(questions, answers);
  if (!scoring) return total === 0 ? 0 : Math.round((correct / total) * 100);

  const answeredWrong = questions.reduce(
    (acc, q, i) => acc + (answers[i] != null && answers[i] !== q.correct ? 1 : 0),
    0,
  );
  const raw = correct * scoring.correct + answeredWrong * scoring.wrong;
  const max = total * scoring.correct;
  if (max <= 0) return 0;
  return Math.max(0, Math.min(100, Math.round((raw / max) * 100)));
}
