import { Alert, Button } from 'antd'
import { LeftOutlined, ProfileOutlined } from '@ant-design/icons'
import type { AnswerValue, Question } from '../../api/types'
import { OPTION_ICON } from '../../constants/answerOptions'
import { useEffect, useRef, useState } from 'react'

interface QuestionPanelProps {
  question: Question
  index: number
  total: number
  saving: boolean
  onAnswer: (value: AnswerValue) => void
  onBack: () => void
  canBack: boolean
  reviewing?: boolean
  onOpenDirectory?: () => void
}

function SuccessStars() {
  return <span className="concept-success-stars" aria-hidden="true">
    {Array.from({ length: 6 }, (_, index) => <span className={`concept-star concept-star-${index + 1}`} key={index}>
      <svg viewBox="0 0 784.11 815.53" focusable="false">
        <path d="M392.05 0c-20.9 210.08-184.06 378.41-392.05 407.78 207.96 29.37 371.12 197.68 392.05 407.74 20.93-210.06 184.09-378.37 392.05-407.74C576.12 378.4 412.95 210.09 392.05 0Z" />
      </svg>
    </span>)}
  </span>
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
  onOpenDirectory,
}: QuestionPanelProps) {
  type CheckedAnswer = Exclude<AnswerValue, 'DONT_KNOW'>
  const [checkState, setCheckState] = useState<{ value: CheckedAnswer; choice: boolean | null; correct: boolean } | null>(null)
  const advanceTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => () => { if (advanceTimer.current) clearTimeout(advanceTimer.current) }, [])

  function selectLevel(value: AnswerValue) {
    if (value === 'DONT_KNOW' || !question.checks[value]) {
      onAnswer(value)
      return
    }
    setCheckState({ value, choice: null, correct: false })
  }

  function judge(choice: boolean) {
    if (!checkState || saving || checkState.correct) return
    const check = question.checks[checkState.value]
    if (!check) return
    const correct = choice === check.expected
    setCheckState({ ...checkState, choice, correct })
    if (correct) advanceTimer.current = setTimeout(() => onAnswer(checkState.value), 900)
  }

  if (checkState) {
    const check = question.checks[checkState.value]!
    const selectedLabel = question.options.find(option => option.value === checkState.value)?.label ?? ''
    const difficulty = checkState.value === 'HEARD_OF' ? '入门概念' : checkState.value === 'BASICALLY_KNOW' ? '核心概念' : '深入概念'
    const wrong = checkState.choice !== null && !checkState.correct
    return <div className="question-panel concept-check-panel">
      <span className="badge">{difficulty}判断</span>
      <p className="concept-check-context">你选择了“{selectedLabel}”，请判断下面的说法。</p>
      <h2 tabIndex={-1}>{check.statement}</h2>
      <div className="concept-check-answers" role="group" aria-label="概念判断选项">
        <Button className={`${checkState.choice === true ? 'selected' : ''} ${checkState.correct && checkState.choice === true ? 'concept-answer-correct' : ''}`} disabled={saving || checkState.correct} onClick={() => judge(true)}>正确{checkState.correct && checkState.choice === true && <SuccessStars />}</Button>
        <Button className={`${checkState.choice === false ? 'selected' : ''} ${checkState.correct && checkState.choice === false ? 'concept-answer-correct' : ''}`} disabled={saving || checkState.correct} onClick={() => judge(false)}>错误{checkState.correct && checkState.choice === false && <SuccessStars />}</Button>
      </div>
      {checkState.correct && <Alert type="success" showIcon title="判断正确，即将进入下一题" description={check.explanation} />}
      {wrong && <Alert type="error" showIcon title="这次判断不正确" description={check.explanation} />}
      <div className="concept-check-actions">
        {!checkState.correct && <Button disabled={saving} onClick={() => setCheckState(null)}>重新选择熟悉度</Button>}
        {wrong && <Button type="primary" disabled={saving} onClick={() => onAnswer(checkState.value)}>仍选择“{selectedLabel}”</Button>}
      </div>
    </div>
  }

  return (
    <div className="question-panel">
    <span className="badge">
        {reviewing ? '复核中 · ' : ''}第 {index + 1} / {total} 题
      </span>
      <h2 tabIndex={-1}>{question.questionText}</h2>
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
              onClick={() => selectLevel(option.value)}
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
          icon={<LeftOutlined aria-hidden="true" />}
        >
          返回上一题
        </Button>
        {onOpenDirectory && <Button className="quiz-mobile-directory" type="text" icon={<ProfileOutlined aria-hidden="true" />} disabled={saving} onClick={onOpenDirectory} aria-haspopup="dialog">题目目录</Button>}
        {reviewing && <span className="muted">修改后会回到复核状态，确认无误后再查看结果</span>}
      </div>
    </div>
  )
}
