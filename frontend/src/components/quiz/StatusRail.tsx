import {
  MASTERED_VALUES,
  TO_LEARN_VALUES,
  type AnswerValue,
  type Question,
} from '../../api/types'
import { answerLabel } from '../../constants/answerOptions'

interface StatusRailProps {
  questions: Question[]
  currentIndex: number
  onJump: (index: number) => void
  disabled?: boolean
}

interface RailEntry {
  question: Question
  label: string
  index: number
}

function entries(
  questions: Question[],
  predicate: (value: AnswerValue) => boolean,
): RailEntry[] {
  return questions
    .map((question, index) => ({
      question,
      label: answerLabel(question.answer),
      index,
    }))
    .filter((entry) => entry.question.answer && predicate(entry.question.answer))
}

export function StatusRail({
  questions,
  currentIndex,
  onJump,
  disabled = false,
}: StatusRailProps) {
  const current = questions[currentIndex]
  const mastered = entries(questions, (value) =>
    (MASTERED_VALUES as readonly AnswerValue[]).includes(value),
  )
  const toLearn = entries(questions, (value) =>
    (TO_LEARN_VALUES as readonly AnswerValue[]).includes(value),
  )
  const pending = questions.filter((q) => q.answer === null)
  const currentQuestion =
    current && current.answer === null
      ? { question: current, index: currentIndex }
      : null
  const restPending = currentQuestion
    ? pending.filter(
        (q) => q.questionId !== currentQuestion.question.questionId,
      )
    : pending

  return (
    <aside className="stack rail">
      <div className="card rail-card">
        <h3>你的基础判断</h3>
        <p className="rail-note">
          基于你的自评生成，不是能力分数，也不会用来评判你。
        </p>

        <RailGroup
          title="已掌握"
          tone="mastered"
          count={mastered.length}
          items={mastered}
          onJump={onJump}
          currentIndex={currentIndex}
          disabledJump={disabled}
        />
        <RailGroup
          title="待补齐"
          tone="tolearn"
          count={toLearn.length}
          items={toLearn}
          onJump={onJump}
          currentIndex={currentIndex}
          disabledJump={disabled}
        />

        <div className="rail-group">
          <div className="rail-title">
            <span>正在确认</span>
            <em>{currentQuestion ? 1 : 0}</em>
          </div>
          {currentQuestion ? (
            <button
              type="button"
              className="rail-item current"
              disabled={disabled}
              onClick={() => onJump(currentQuestion.index)}
            >
              <span className="rail-dot" />
              {currentQuestion.question.nodeName}
            </button>
          ) : (
            <p className="muted empty-line">本轮确认已完成</p>
          )}
        </div>

        <RailGroup
          title="尚未确认"
          tone="pending"
          count={restPending.length}
          items={restPending.map((q) => ({
            question: q,
            label: '',
            index: questions.findIndex((item) => item.questionId === q.questionId),
          }))}
          onJump={onJump}
          currentIndex={currentIndex}
          disabledJump={disabled}
        />
      </div>
    </aside>
  )
}

interface RailGroupProps {
  title: string
  tone: 'mastered' | 'tolearn' | 'pending'
  count: number
  items: RailEntry[]
  onJump: (index: number) => void
  currentIndex: number
  disabledJump?: boolean
}

function RailGroup({
  title,
  tone,
  count,
  items,
  onJump,
  currentIndex,
  disabledJump,
}: RailGroupProps) {
  return (
    <div className="rail-group">
      <div className="rail-title">
        <span>{title}</span>
        <em>{count}</em>
      </div>
      {items.length === 0 ? (
        <p className="muted empty-line">还没有</p>
      ) : (
        items.map((item) => (
          <button
            type="button"
            key={item.question.questionId}
            className={`rail-item ${tone} ${item.index === currentIndex ? 'current' : ''}`}
            aria-current={item.index === currentIndex ? 'step' : undefined}
            disabled={Boolean(disabledJump)}
            onClick={() => onJump(item.index)}
          >
            <span className="rail-dot" />
            <span className="rail-name">{item.question.nodeName}</span>
            {item.label && <small>{item.label}</small>}
          </button>
        ))
      )}
    </div>
  )
}
