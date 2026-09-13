import type { Question } from '../../api/types'

const PREFIX = 'ksteps:answer-draft:v1:'
const TTL = 24 * 60 * 60 * 1000
const key = (userId: string, sessionId: string) => PREFIX + JSON.stringify([userId, sessionId])
// A version fingerprint, not a security token. Identity/ownership still comes from the API.
function version(questions: Question[]): string {
  const value = JSON.stringify(questions.map(q => [q.questionId, q.nodeId, q.nodeName, q.questionText, q.hint, q.options]))
  let hash = 2166136261
  for (let i = 0; i < value.length; i++) hash = Math.imul(hash ^ value.charCodeAt(i), 16777619)
  return `${value.length}:${hash >>> 0}`
}

export function clearAnswerDraft(userId: string, sessionId: string): void {
  try { sessionStorage.removeItem(key(userId, sessionId)) } catch { /* Storage may be disabled. */ }
}

export function clearAnswerDrafts(): void {
  try {
    for (let i = sessionStorage.length - 1; i >= 0; i--) {
      const item = sessionStorage.key(i)
      if (item?.startsWith(PREFIX)) sessionStorage.removeItem(item)
    }
  } catch { /* Private browsing/storage restrictions must not break authentication. */ }
}

export function writeAnswerDraft(userId: string, sessionId: string, base: Question[], draft: Question[]): boolean {
  if (!userId || version(base) !== version(draft)) return false
  try {
    sessionStorage.setItem(key(userId, sessionId), JSON.stringify({
      version: version(base), savedAt: Date.now(),
      base: base.map(q => q.answer), answers: draft.map(q => q.answer),
    }))
    return true
  } catch { return false }
}

export function restoreAnswerDraft(userId: string, sessionId: string, questions: Question[]): Question[] {
  try {
    const raw = sessionStorage.getItem(key(userId, sessionId))
    if (!raw) return questions
    const draft = JSON.parse(raw)
    const valid = draft && draft.version === version(questions)
      && Number.isFinite(draft.savedAt) && Date.now() - draft.savedAt >= 0 && Date.now() - draft.savedAt < TTL
      && Array.isArray(draft.answers) && draft.answers.length === questions.length
      && Array.isArray(draft.base) && draft.base.length === questions.length
      && questions.every((q, i) =>
        (draft.answers[i] === null || q.options.some(option => option.value === draft.answers[i]))
        && (q.answer === draft.base[i] || q.answer === draft.answers[i]))
    if (valid) return questions.map((q, i) => ({ ...q, answer: draft.answers[i] }))
  } catch { /* Corrupt or inaccessible drafts fall back to server answers. */ }
  clearAnswerDraft(userId, sessionId)
  return questions
}
