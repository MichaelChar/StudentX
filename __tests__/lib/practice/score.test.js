import { describe, it, expect } from 'vitest';
import { countCorrect, scorePercent } from '@/lib/practice/score';

// Questions carry display-space `.correct`; answers[i] is the chosen display
// index (or null). These mirror the shape TestPlayer/ScoreSummary pass in.
const q = (correct) => ({ correct });

describe('countCorrect', () => {
  it('counts positional matches, ignoring nulls', () => {
    const questions = [q(0), q(1), q(2)];
    expect(countCorrect(questions, [0, 1, 2])).toBe(3);
    expect(countCorrect(questions, [0, 0, 2])).toBe(2);
    expect(countCorrect(questions, [null, 1, null])).toBe(1);
  });
});

describe('scorePercent', () => {
  it('without scoring, returns plain correct/total percentage', () => {
    const questions = [q(0), q(1), q(2), q(3)];
    expect(scorePercent(questions, [0, 1, 2, 3])).toBe(100);
    expect(scorePercent(questions, [0, 1, 0, 0])).toBe(50);
  });

  it('returns 0 for an empty test', () => {
    expect(scorePercent([], [])).toBe(0);
  });

  const scoring = { correct: 0.2, wrong: -0.05 };

  it('with scoring, weights correct up and answered-wrong down', () => {
    // 45 questions, all correct -> raw 9.0, max 9.0 -> 100%
    const all = Array.from({ length: 45 }, () => q(0));
    expect(scorePercent(all, all.map(() => 0), scoring)).toBe(100);
  });

  it('with scoring, subtracts the penalty for wrong answers', () => {
    // 10 questions: 8 correct (+1.6), 2 wrong (-0.1) -> raw 1.5, max 2.0 -> 75%
    const questions = Array.from({ length: 10 }, () => q(0));
    const answers = [0, 0, 0, 0, 0, 0, 0, 0, 1, 1];
    expect(scorePercent(questions, answers, scoring)).toBe(75);
  });

  it('with scoring, unanswered questions score zero (no penalty)', () => {
    // 10 questions: 5 correct (+1.0), 0 wrong, 5 unanswered -> raw 1.0, max 2.0 -> 50%
    const questions = Array.from({ length: 10 }, () => q(0));
    const answers = [0, 0, 0, 0, 0, null, null, null, null, null];
    expect(scorePercent(questions, answers, scoring)).toBe(50);
  });

  it('with scoring, floors a net-negative raw score at 0%', () => {
    // 4 questions: 1 correct (+0.2), 3 wrong (-0.15) -> raw 0.05... still positive.
    // 4 questions: 0 correct, 4 wrong (-0.2) -> raw -0.2 -> clamped to 0%
    const questions = Array.from({ length: 4 }, () => q(0));
    expect(scorePercent(questions, [1, 1, 1, 1], scoring)).toBe(0);
  });
});
