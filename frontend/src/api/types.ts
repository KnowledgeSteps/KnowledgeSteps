export type SessionStatus =
  | 'GENERATING_GRAPH'
  | 'SEARCHING_RESOURCES'
  | 'GENERATING_QUESTIONS'
  | 'READY'
  | 'COMPLETED'
  | 'FAILED'

export type AnswerValue =
  | 'VERY_FAMILIAR'
  | 'BASICALLY_KNOW'
  | 'HEARD_OF'
  | 'DONT_KNOW'

export type MasteryStatus = 'UNKNOWN' | 'MASTERED' | 'TO_LEARN'

export type ResourceStatus =
  | 'PENDING'
  | 'READY'
  | 'EMPTY'
  | 'FAILED'
  | 'NOT_APPLICABLE'

export interface QuestionOption {
  value: AnswerValue
  label: string
}

export interface Question {
  questionId: string
  nodeId: string
  nodeName: string
  questionText: string
  hint: string | null
  options: QuestionOption[]
  answer: AnswerValue | null
}

export interface SessionProgress {
  processedNodes: number
  totalNodes: number
}

export interface SessionError {
  code: string
  message: string
}

export interface SessionDetail {
  sessionId: string
  target: string
  status: SessionStatus
  progress: SessionProgress
  warnings: string[]
  error: SessionError | null
}

export interface AnswerSaveResult {
  questionId: string
  masteryStatus: MasteryStatus
  answeredCount: number
  totalQuestions: number
}

export interface KnowledgeNode {
  id: string
  name: string
  isTarget: boolean
  level: number
}

export interface GraphEdge {
  from: string
  to: string
}

export interface CompletionResult {
  sessionId: string
  status: 'COMPLETED'
  target: string
  missingCount: number
  nodes: KnowledgeNode[]
  edges: GraphEdge[]
}

export interface LearningResource {
  id: string
  title: string
  url: string
  summary: string | null
  authorName: string | null
  voteCount: number | null
}

export interface NodeResources {
  nodeId: string
  nodeName: string
  reason: string
  resourceStatus: ResourceStatus
  resources: LearningResource[]
}

export const MASTERED_VALUES: readonly AnswerValue[] = [
  'VERY_FAMILIAR',
  'BASICALLY_KNOW',
]

export const TO_LEARN_VALUES: readonly AnswerValue[] = ['HEARD_OF', 'DONT_KNOW']

export class ApiError extends Error {
  code: string
  status: number

  constructor(status: number, code: string, message: string) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.code = code
  }
}
