import { ProfileOutlined } from '@ant-design/icons'
import { Button } from 'antd'
import type { Question } from '../../api/types'
import './answer-check.css'

interface StatusRailProps {
  questions: Question[]
  currentIndex: number
  onJump: (index: number) => void
  disabled?: boolean
  active?: boolean
}

export function StatusRail({ questions, currentIndex, onJump, disabled = false, active = true }: StatusRailProps) {
  return <aside className="rail quiz-rail" aria-label="题目目录">
    <div className="quiz-rail-inner">
      <header className="quiz-rail-header">
        <h3><ProfileOutlined aria-hidden="true" /> 题目目录</h3>
        <p className="rail-note">按顺序了解你的基础，点击题目可返回修改。</p>
      </header>
      <div className="quiz-rail-scroll" tabIndex={0} role="region" aria-label="题目目录，可滚动">
        <ol className="quiz-directory">
          {questions.map((question, index) => {
            const current = active && index === currentIndex
            const answered = question.answer !== null
            return <li key={question.questionId}>
              <Button htmlType="button" className={`rail-item ${current ? 'current' : ''}`} disabled={disabled}
                aria-current={current ? 'step' : undefined}
                aria-label={`第 ${index + 1} 题，${question.nodeName}，${answered ? '已回答' : '未回答'}`}
                onClick={() => onJump(index)}>
                <span className="rail-dot" aria-hidden="true" />
                <span className="rail-name">{question.nodeName}</span>
                <AnswerCheck checked={answered} />
              </Button>
            </li>
          })}
        </ol>
      </div>
    </div>
  </aside>
}

// From Uiverse.io by 00Kubi. Decorative status inside the directory button, not a second input.
function AnswerCheck({ checked }: { checked: boolean }) {
  return <span className="neon-checkbox" data-checked={checked} aria-hidden="true">
    <span className="neon-checkbox__frame">
      <span className="neon-checkbox__box">
        <span className="neon-checkbox__check-container">
          <svg viewBox="0 0 24 24" className="neon-checkbox__check"><path d="M3,12.5l7,7L21,5" /></svg>
        </span>
        <span className="neon-checkbox__glow" />
        <span className="neon-checkbox__borders">{Array.from({ length: 4 }, (_, i) => <span key={i} />)}</span>
      </span>
      <span className="neon-checkbox__effects">
        <span className="neon-checkbox__particles">{Array.from({ length: 12 }, (_, i) => <span key={i} />)}</span>
        <span className="neon-checkbox__rings">{Array.from({ length: 3 }, (_, i) => <span className="ring" key={i} />)}</span>
        <span className="neon-checkbox__sparks">{Array.from({ length: 4 }, (_, i) => <span key={i} />)}</span>
      </span>
    </span>
  </span>
}
