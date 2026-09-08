import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import type { AnswerValue, Question } from '../api/types'
import { ApiError } from '../api/types'
import {
  completeSession,
  getQuestions,
  saveAnswer,
} from '../api/sessions'
import { isGenerating, useSession } from '../hooks/useSession'
import { WaitingView } from '../components/waiting/WaitingView'
import { QuestionPanel } from '../components/quiz/QuestionPanel'
import { StatusRail } from '../components/quiz/StatusRail'

function errorMessage(caught: unknown): string {
  return caught instanceof ApiError
    ? caught.message
    : '操作没有成功，请稍后重试。'
}

export function SessionQuestionsPage() {
  const { sessionId = '' } = useParams()
  const navigate = useNavigate()
  const { session, error: sessionError } = useSession(sessionId)

  const [questions, setQuestions] = useState<Question[] | null>(null)
  const [currentIndex, setCurrentIndex] = useState(0)
  const [savingQuestionId, setSavingQuestionId] = useState<string | null>(null)
  const [completing, setCompleting] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)

  const canShowQuiz =
    session?.status === 'READY' || session?.status === 'COMPLETED'

  useEffect(() => {
    if (!sessionId || !canShowQuiz) return
    let cancelled = false
    getQuestions(sessionId)
      .then((payload) => {
        if (cancelled) return
        setActionError(null)
        const firstUnanswered = payload.questions.findIndex(
          (q) => q.answer === null,
        )
        setQuestions(payload.questions)
        setCurrentIndex(firstUnanswered >= 0 ? firstUnanswered : 0)
      })
      .catch((caught: unknown) => {
        if (!cancelled) setActionError(errorMessage(caught))
      })
    return () => {
      cancelled = true
    }
  }, [sessionId, canShowQuiz])

  const currentQuestion = questions?.[currentIndex] ?? null
  const answeredCount =
    questions?.filter((q) => q.answer !== null).length ?? 0
  const totalQuestions = questions?.length ?? 0
  const allAnswered =
    questions !== null && totalQuestions > 0 && answeredCount === totalQuestions

  async function chooseAnswer(value: AnswerValue): Promise<void> {
    if (!currentQuestion || savingQuestionId) return
    const question = currentQuestion
    const nextUnanswered = questions!.findIndex(
      (item, index) => index !== currentIndex && item.answer === null,
    )
    setSavingQuestionId(question.questionId)
    setActionError(null)
    try {
      await saveAnswer(sessionId, question.questionId, value)
      setQuestions((prev) =>
        prev?.map((item) =>
          item.questionId === question.questionId ? { ...item, answer: value } : item,
        ) ?? null,
      )
      if (nextUnanswered >= 0) setCurrentIndex(nextUnanswered)
    } catch (caught) {
      setActionError(errorMessage(caught))
    } finally {
      setSavingQuestionId(null)
    }
  }

  async function handleComplete(): Promise<void> {
    setCompleting(true)
    setActionError(null)
    try {
      const result = await completeSession(sessionId)
      navigate(`/sessions/${result.sessionId}/result`)
    } catch (caught) {
      setActionError(errorMessage(caught))
    } finally {
      setCompleting(false)
    }
  }

  function renderBody() {
    if (sessionError) {
      return (
        <SessionMessage
          title="暂时无法读取任务"
          body={sessionError.message}
          onHome={() => navigate('/')}
        />
      )
    }
    if (!session) {
      return <LoadingPage />
    }
    if (session.status === 'FAILED') {
      return (
        <SessionMessage
          title="这次寻路没有成功"
          body={session.error?.message ?? '生成失败，请重新创建任务。'}
          onHome={() => navigate('/')}
        />
      )
    }
    if (isGenerating(session.status)) {
      return <WaitingView session={session} />
    }
    if (!questions || questions.length === 0) {
      if (!actionError) {
        return <LoadingPage label="正在准备问卷…" />
      }
      return (
        <SessionMessage
          title="还没有可作答的题目"
          body="生成问卷时遇到了一点问题，请返回首页重新寻路。"
          onHome={() => navigate('/')}
        />
      )
    }

    return (
      <div className="twocol quiz-layout">
        <section className="card question">
          <div className="between">
            <span>
              已回答 <em>{answeredCount}</em> / {totalQuestions}
            </span>
            <span className="muted">每一个回答，都让路径更准确</span>
          </div>
          <div className="progress" style={{ marginTop: 18 }}>
            <i style={{ width: `${(answeredCount / totalQuestions) * 100}%` }} />
          </div>
          <div className="mentor">
            <span className="spark">✧</span>
            <div>
              <strong>知阶正在确认你的基础</strong>
              <p>没有标准答案，按真实情况选择就好；已掌握的节点不会出现在结果里。</p>
            </div>
          </div>

          {allAnswered ? (
            <div className="complete-panel">
              <span className="badge">问卷已完成</span>
              <h2>可以查看你的补齐路径了</h2>
              <p>
                结果基于你的自评生成，不是能力测试。如果中途想改，随时可以回到任意一题。
              </p>
              {actionError && (
                <p className="field-error" role="alert">
                  {actionError}
                </p>
              )}
              <button
                type="button"
                className="primary"
                disabled={completing}
                onClick={() => void handleComplete()}
              >
                {completing ? '正在生成路径…' : '查看结果 →'}
              </button>
            </div>
          ) : (
            currentQuestion && (
              <>
                <QuestionPanel
                  question={currentQuestion}
                  index={currentIndex}
                  total={totalQuestions}
                  saving={savingQuestionId === currentQuestion.questionId}
                  onAnswer={(value) => void chooseAnswer(value)}
                  onBack={() => setCurrentIndex((i) => Math.max(0, i - 1))}
                  canBack={currentIndex > 0}
                />
                {actionError && (
                  <p className="field-error" role="alert">
                    {actionError}
                  </p>
                )}
              </>
            )
          )}
        </section>

        <StatusRail
          questions={questions}
          currentIndex={currentIndex}
          onJump={(index) => setCurrentIndex(index)}
        />
      </div>
    )
  }

  return (
    <>
      <div className="toolbar">
        <button className="textbutton" onClick={() => navigate('/')}>
          ‹ 返回首页
        </button>
        <span className="tool-title">{session?.target ?? '寻路中'}</span>
        <span className="muted">Mock 演示</span>
      </div>
      {renderBody()}
    </>
  )
}

function SessionMessage({
  title,
  body,
  onHome,
}: {
  title: string
  body: string
  onHome: () => void
}) {
  return (
    <section className="fail-panel enter">
      <span className="badge">提示</span>
      <h1>{title}</h1>
      <p>{body}</p>
      <div className="actions">
        <button className="primary" onClick={onHome}>
          回到首页 →
        </button>
      </div>
    </section>
  )
}

function LoadingPage({ label = '正在读取任务…' }: { label?: string }) {
  return (
    <section className="loading-page enter">
      <span className="spark">✧</span>
      <p>{label}</p>
    </section>
  )
}
