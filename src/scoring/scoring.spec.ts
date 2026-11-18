import { describe, expect, it } from 'vitest';
import { type AnswerKeyEntry, calculateScore, getPerformanceMessage, type SubmittedAnswer } from './scoring';

/** Builds an answer key q1..qN where the correct option of qN is "qN-correct". */
function answerKey(questionCount: number): AnswerKeyEntry[] {
  return Array.from({ length: questionCount }, (_, i) => ({
    questionId: `q${i + 1}`,
    correctOptionId: `q${i + 1}-correct`,
  }));
}

function right(questionId: string): SubmittedAnswer {
  return { questionId, optionId: `${questionId}-correct` };
}

function wrong(questionId: string): SubmittedAnswer {
  return { questionId, optionId: `${questionId}-wrong` };
}

describe('calculateScore', () => {
  it('scores 4 correct out of 5 as 80%', () => {
    const result = calculateScore(answerKey(5), [right('q1'), right('q2'), right('q3'), right('q4'), wrong('q5')]);

    expect(result).toMatchObject({ correct: 4, total: 5, percentage: 80 });
  });

  it('scores all correct answers as 100%', () => {
    const result = calculateScore(answerKey(3), [right('q1'), right('q2'), right('q3')]);

    expect(result).toMatchObject({ correct: 3, total: 3, percentage: 100 });
  });

  it('scores all wrong answers as 0%', () => {
    const result = calculateScore(answerKey(3), [wrong('q1'), wrong('q2'), wrong('q3')]);

    expect(result).toMatchObject({ correct: 0, total: 3, percentage: 0 });
  });

  describe('skipped questions', () => {
    it('counts skipped questions as wrong', () => {
      const result = calculateScore(answerKey(5), [right('q1'), right('q2'), right('q4'), right('q5')]);

      expect(result).toMatchObject({ correct: 4, total: 5, percentage: 80 });
    });

    it('reports a skipped question with no selected option', () => {
      const result = calculateScore(answerKey(2), [right('q1')]);

      expect(result.questions[1]).toEqual({
        questionId: 'q2',
        selectedOptionId: null,
        correctOptionId: 'q2-correct',
        isCorrect: false,
      });
    });

    it('scores a submission with no answers as 0% over the full quiz', () => {
      const result = calculateScore(answerKey(4), []);

      expect(result).toMatchObject({ correct: 0, total: 4, percentage: 0 });
    });
  });

  describe('per-question results', () => {
    it('reports the selected and correct option for every question', () => {
      const result = calculateScore(answerKey(2), [right('q1'), wrong('q2')]);

      expect(result.questions).toEqual([
        { questionId: 'q1', selectedOptionId: 'q1-correct', correctOptionId: 'q1-correct', isCorrect: true },
        { questionId: 'q2', selectedOptionId: 'q2-wrong', correctOptionId: 'q2-correct', isCorrect: false },
      ]);
    });

    it('lists questions in answer-key order, whatever order the answers arrive in', () => {
      const result = calculateScore(answerKey(3), [right('q3'), wrong('q1'), right('q2')]);

      expect(result.questions.map((q) => q.questionId)).toEqual(['q1', 'q2', 'q3']);
    });
  });

  describe('percentage rounding', () => {
    it.each([
      [1, 3, 33],
      [2, 3, 67],
      [1, 6, 17],
      [5, 8, 63], // 62.5 rounds half up
      [7, 9, 78],
      [1, 200, 1], // 0.5 rounds half up
      [159, 200, 80], // 79.5 rounds half up
    ])('scores %i correct out of %i as %i%%', (correctCount, total, expected) => {
      const key = answerKey(total);
      const answers = key.map((entry, i) => (i < correctCount ? right(entry.questionId) : wrong(entry.questionId)));

      expect(calculateScore(key, answers).percentage).toBe(expected);
    });
  });

  describe('invalid input', () => {
    it('throws when the answer key is empty', () => {
      expect(() => calculateScore([], [])).toThrow('Answer key must not be empty');
    });

    it('throws when an answer references a question that is not in the answer key', () => {
      expect(() => calculateScore(answerKey(2), [right('q1'), right('q99')])).toThrow(
        'Answer references unknown question q99',
      );
    });

    it('throws when the same question is answered twice', () => {
      expect(() => calculateScore(answerKey(2), [right('q1'), wrong('q1')])).toThrow(
        'Question q1 is answered more than once',
      );
    });
  });
});

describe('getPerformanceMessage', () => {
  it.each([
    [100, 'You scored 100%. Perfect score!'],
    [99, 'You scored 99%. Great job!'],
    [80, 'You scored 80%. Great job!'],
    [79, 'You scored 79%. Good effort, keep practicing.'],
    [50, 'You scored 50%. Good effort, keep practicing.'],
    [49, 'You scored 49%. Keep learning: review the explanations and try again.'],
    [0, 'You scored 0%. Keep learning: review the explanations and try again.'],
  ])('returns the right message for %i%%', (percentage, expected) => {
    expect(getPerformanceMessage(percentage)).toBe(expected);
  });

  it('matches the band of the score calculateScore reports (4/5 → Great job)', () => {
    const { percentage } = calculateScore(answerKey(5), [right('q1'), right('q2'), right('q3'), right('q4')]);

    expect(getPerformanceMessage(percentage)).toBe('You scored 80%. Great job!');
  });

  it.each([-1, 101, 80.5, Number.NaN])('throws a RangeError for %s', (percentage) => {
    expect(() => getPerformanceMessage(percentage)).toThrow(RangeError);
  });
});
