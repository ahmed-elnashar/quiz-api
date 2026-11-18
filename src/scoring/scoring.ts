export interface AnswerKeyEntry {
  questionId: string;
  correctOptionId: string;
}

export interface SubmittedAnswer {
  questionId: string;
  optionId: string;
}

export interface QuestionResult {
  questionId: string;
  /** null when the question was skipped. */
  selectedOptionId: string | null;
  correctOptionId: string;
  isCorrect: boolean;
}

export interface ScoreResult {
  correct: number;
  total: number;
  /** Whole-number percentage, 0-100. */
  percentage: number;
  /** One entry per answer-key question, in answer-key order. */
  questions: QuestionResult[];
}

/**
 * Grades a submission against the answer key.
 * Questions without an answer (skipped) count as wrong.
 * Throws on input the submit flow should already have rejected, because
 * reaching here with it means a bug, not a user error.
 */
export function calculateScore(answerKey: AnswerKeyEntry[], answers: SubmittedAnswer[]): ScoreResult {
  if (answerKey.length === 0) {
    throw new Error('Answer key must not be empty');
  }

  const keyedQuestionIds = new Set(answerKey.map((entry) => entry.questionId));
  const selectedByQuestion = new Map<string, string>();
  for (const answer of answers) {
    if (!keyedQuestionIds.has(answer.questionId)) {
      throw new Error(`Answer references unknown question ${answer.questionId}`);
    }
    if (selectedByQuestion.has(answer.questionId)) {
      throw new Error(`Question ${answer.questionId} is answered more than once`);
    }
    selectedByQuestion.set(answer.questionId, answer.optionId);
  }

  const questions = answerKey.map(({ questionId, correctOptionId }): QuestionResult => {
    const selectedOptionId = selectedByQuestion.get(questionId) ?? null;
    return { questionId, selectedOptionId, correctOptionId, isCorrect: selectedOptionId === correctOptionId };
  });

  const correct = questions.filter((question) => question.isCorrect).length;
  const total = answerKey.length;
  return { correct, total, percentage: Math.round((correct * 100) / total), questions };
}

/** Feedback for a whole-number percentage (0-100), e.g. "You scored 80%. Great job!". */
export function getPerformanceMessage(percentage: number): string {
  if (!Number.isInteger(percentage) || percentage < 0 || percentage > 100) {
    throw new RangeError(`Percentage must be a whole number from 0 to 100, got ${percentage}`);
  }
  return `You scored ${percentage}%. ${bandMessage(percentage)}`;
}

function bandMessage(percentage: number): string {
  if (percentage === 100) return 'Perfect score!';
  if (percentage >= 80) return 'Great job!';
  if (percentage >= 50) return 'Good effort, keep practicing.';
  return 'Keep learning: review the explanations and try again.';
}
