import type { AnswerValue, Question } from '../../api/types'

/** Stop the remaining writes when the owning page has been left. */
export async function submitAssessment<T>(
  questions: Question[],
  save: (id: string, answer: AnswerValue) => Promise<unknown>,
  complete: () => Promise<T>,
  isActive: () => boolean,
): Promise<T | null> {
  if (!questions.length || questions.some(question => question.answer === null)) {
    throw new Error('问卷尚未完成')
  }
  for (const question of questions) {
    if (!isActive()) return null
    await save(question.questionId, question.answer!)
  }
  if (!isActive()) return null
  const result = await complete()
  return isActive() ? result : null
}
