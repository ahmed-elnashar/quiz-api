/** Stored as JSON in Notification.payload, written in the submit transaction. */
export interface QuizResultPayload {
  userName: string;
  userEmail: string;
  quizTitle: string;
  score: { correct: number; total: number };
  percentage: number;
  message: string;
  /** ISO 8601 */
  completedAt: string;
}

export function serializePayload(payload: QuizResultPayload): string {
  return JSON.stringify(payload);
}

export function parsePayload(raw: string): QuizResultPayload {
  return JSON.parse(raw) as QuizResultPayload;
}

export function buildQuizResultEmail(payload: QuizResultPayload): { to: string; subject: string; text: string } {
  return {
    to: payload.userEmail,
    subject: `Your result for "${payload.quizTitle}"`,
    text: [
      `Hi ${payload.userName},`,
      '',
      `You completed "${payload.quizTitle}" on ${payload.completedAt}.`,
      `Score: ${payload.score.correct}/${payload.score.total} (${payload.percentage}%)`,
      payload.message,
    ].join('\n'),
  };
}
