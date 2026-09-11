import { Button } from 'antd'
import type { AnswerValue, Question } from '../../api/types'
import { OPTION_ICON } from '../../constants/answerOptions'

interface QuestionPanelProps {
  question: Question
  index: number
  total: number
  saving: boolean
  onAnswer: (value: AnswerValue) => void
  onBack: () => void
  canBack: boolean
  reviewing?: boolean
}

export function QuestionPanel({
  question,
  index,
  total,
  saving,
  onAnswer,
  onBack,
  canBack,
  reviewing = false,
}: QuestionPanelProps) {
  return (
    <div className="question-panel">
    <span className="badge">
        {reviewing ? '复核中' : '正在确认'} · 第 {index + 1} / {total} 题
      </span>
      <h2>{question.questionText}</h2>
      {question.hint && <p className="sub">{question.hint}</p>}

      <div className="answers" role="group" aria-label="自评选项">
        {question.options.map((option) => {
          const selected = question.answer === option.value
          const Icon = OPTION_ICON[option.value]
          return (
            <Button
              key={option.value}
              htmlType="button"
              className={`answer ${selected ? 'selected' : ''}`}
              disabled={saving}
              onClick={() => onAnswer(option.value)}
              aria-pressed={selected}
            >
              <span className="letter"><Icon aria-hidden="true" /></span>
              <strong>{option.label}</strong>
            </Button>
          )
        })}
      </div>

      <div className="between navline">
        <Button
          htmlType="button"
          type="text" className="textbutton"
          disabled={!canBack || saving}
          onClick={onBack}
        >
          返回上一题
        </Button>
        <span className="muted">
          {reviewing
            ? '修改后会回到复核状态，确认无误后再查看结果'
            : '选择后会自动进入下一题，可以随时返回修改'}
        </span>
      </div>
    </div>
  )
}
