import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { createSession } from '../api/sessions'
import { ApiError } from '../api/types'

const PROMPTS = [
  { icon: '🧠', label: 'Transformer' },
  { icon: '📚', label: 'RAG' },
  { icon: '☕', label: 'Spring Boot' },
  { icon: '✨', label: '线性代数' },
]

export function HomePage() {
  const navigate = useNavigate()
  const [goal, setGoal] = useState('')
  const [fieldError, setFieldError] = useState<string | null>(null)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  async function submit(value: string): Promise<void> {
    const target = value.trim()
    setFieldError(null)
    setSubmitError(null)
    if (!target) {
      setFieldError('先告诉我你想学什么，例如 Transformer 或 RAG。')
      return
    }
    if (target.length > 100) {
      setFieldError('目标太长了，请精简到 100 个字以内。')
      return
    }
    setSubmitting(true)
    try {
      const { sessionId } = await createSession(target)
      navigate(`/sessions/${sessionId}/questions`)
    } catch (caught) {
      const message =
        caught instanceof ApiError
          ? caught.message
          : '创建任务失败，请稍后重试。'
      setSubmitError(message)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <>
      <section className="hero">
        <div className="hero-copy enter">
          <span className="eyebrow">基于知识依赖 · AI 学习寻路</span>
          <h1>
            告诉我你想学什么，
            <br />
            我只告诉你<span className="highlight">还缺什么</span>
          </h1>
          <p className="hero-sub">
            从目标知识倒推前置台阶，再用几句简短自评隐藏你已经掌握的部分，
            把“想学却不知道怎么开始”变成一条清晰的下一步。
          </p>

          <form
            className="searchbox"
            onSubmit={(event) => {
              event.preventDefault()
              void submit(goal)
            }}
            noValidate
          >
            <span className="search-icon" aria-hidden="true">
              <svg viewBox="0 0 20 20">
                <circle cx="9" cy="9" r="5.5" />
                <path d="m13.5 13.5 4 4" />
              </svg>
            </span>
            <input
              aria-label="你想学习什么"
              placeholder="例如：Transformer、RAG、Spring Boot"
              maxLength={100}
              value={goal}
              onChange={(event) => {
                setGoal(event.target.value)
                setFieldError(null)
              }}
            />
            <button
              className="search-submit"
              type="submit"
              aria-label="开始寻路"
              disabled={submitting}
            >
              {submitting ? '…' : '→'}
            </button>
          </form>

          {fieldError && (
            <p className="field-error" role="alert">
              {fieldError}
            </p>
          )}
          {submitError && (
            <p className="field-error" role="alert">
              {submitError}
            </p>
          )}

          <div className="chips" aria-label="热门知识">
            {PROMPTS.map((prompt) => (
              <button
                key={prompt.label}
                type="button"
                className="chip"
                onClick={() => {
                  setGoal(prompt.label)
                  setFieldError(null)
                }}
              >
                <span aria-hidden="true">{prompt.icon}</span>
                {prompt.label}
              </button>
            ))}
          </div>
          <p className="hint">
            目标用于生成寻路结果；当前为 Mock 演示，接口与数据均为本地模拟。
          </p>
        </div>

        <div className="showcase-wrap enter">
          <div className="float-bot" aria-hidden="true">
            <span className="bot-head">◉‿◉</span>
            <span className="bot-bubble">Hi，我是知阶，一起找到你还缺的台阶吧！</span>
          </div>
          <span className="handnote" aria-hidden="true">
            每一种想学，都有它的起点
          </span>

          <div className="showcase">
            <div className="showcase-header">
              <div className="showcase-title">
                <span aria-hidden="true">⚙</span>
                知阶 · 寻路引擎
              </div>
              <span className="showcase-badge">基于知识依赖</span>
            </div>

            <div className="pipeline">
              <article className="pipeline-step">
                <header>
                  <strong>🔍 知识检索</strong>
                  <small>从目标倒推前置知识</small>
                </header>
                <div className="mini-cards">
                  <div className="mini-card">
                    <span>注意力机制</span>
                    <small>前置节点</small>
                  </div>
                  <div className="mini-card">
                    <span>矩阵运算</span>
                    <small>前置节点</small>
                  </div>
                  <div className="mini-card">
                    <span>词向量</span>
                    <small>前置节点</small>
                  </div>
                </div>
              </article>

              <span className="pipe-arrow" aria-hidden="true">
                →
              </span>

              <article className="pipeline-step">
                <header>
                  <strong>📑 知识编译</strong>
                  <small>把依赖整理成结构</small>
                </header>
                <div className="tag-cloud">
                  <span className="tag">关键概念</span>
                  <span className="tag">学习顺序</span>
                  <span className="tag">依赖关系</span>
                  <span className="tag">适用目标</span>
                </div>
              </article>

              <span className="pipe-arrow" aria-hidden="true">
                →
              </span>

              <article className="pipeline-step">
                <header>
                  <strong>🚀 路径推演</strong>
                  <small>只保留你还需要补齐的台阶</small>
                </header>
                <ol className="mini-path">
                  <li className="mini-node">
                    <span className="dot" />
                    <span>前置基础</span>
                  </li>
                  <li className="mini-node">
                    <span className="dot" />
                    <span>中间节点</span>
                  </li>
                  <li className="mini-node goal">
                    <span className="dot" />
                    <span>目标知识</span>
                  </li>
                </ol>
              </article>
            </div>

            <div className="outbranches" aria-hidden="true">
              <span className="outbranch">更多主题</span>
              <span className="outbranch">更多资料</span>
              <span className="outbranch">更多可能</span>
            </div>
          </div>
        </div>
      </section>

      <section className="metrics" aria-label="寻路方式">
        <div className="metric">
          <span className="metric-icon" aria-hidden="true">
            ◫
          </span>
          <div>
            <span className="metric-label">一次任务</span>
            <strong>最多 20</strong>
            <span className="metric-foot">个前置知识节点</span>
          </div>
        </div>
        <div className="metric">
          <span className="metric-icon" aria-hidden="true">
            ⑃
          </span>
          <div>
            <span className="metric-label">每个节点</span>
            <strong>3 条</strong>
            <span className="metric-foot">知乎学习资料</span>
          </div>
        </div>
        <div className="metric">
          <span className="metric-icon" aria-hidden="true">
            ↯
          </span>
          <div>
            <span className="metric-label">每道自评</span>
            <strong>4 档</strong>
            <span className="metric-foot">基础掌握程度</span>
          </div>
        </div>
        <div className="metric-quote">
          <p>“不是替你学会，而是帮你看见，下一步该站在哪一级台阶。”</p>
          <span>—— 知阶 Knowledge Steps</span>
        </div>
      </section>

      <section className="how-it-works">
        <div className="section-head">
          <span className="how-eyebrow">— HOW IT WORKS —</span>
          <h2>三步，把模糊的想学变成可执行的下一步</h2>
          <p>基于前置依赖的 AI 问答式寻路，让复杂的目标变得清晰、可执行。</p>
        </div>

        <div className="how-grid">
          <article className="how-card">
            <div className="how-head">
              <span>1.</span>
              <h3>找到这个知识的台阶</h3>
            </div>
            <p>从目标知识出发，推导出你需要先掌握的前置节点与学习顺序。</p>
            <div className="how-body quotes">
              <div className="quote-row">
                <span className="avatar" aria-hidden="true">
                  A
                </span>
                <span className="quote-bubble">
                  想学 Transformer，发现先要补 Attention
                </span>
              </div>
              <div className="quote-row">
                <span className="avatar" aria-hidden="true">
                  B
                </span>
                <span className="quote-bubble">
                  原来矩阵乘法是最早的一级台阶
                </span>
              </div>
              <div className="quote-row">
                <span className="avatar" aria-hidden="true">
                  C
                </span>
                <span className="quote-bubble">
                  学 RAG，先要理解向量检索
                </span>
              </div>
            </div>
          </article>

          <article className="how-card">
            <div className="how-head">
              <span>2.</span>
              <h3>动态自评，像寻路一样确认基础</h3>
            </div>
            <p>通过少量简短问题逐步缩小范围，找出你已经掌握的部分。</p>
            <div className="how-body chat">
              <div className="chat-bubble ai">你熟悉矩阵运算吗？</div>
              <div className="chat-pill">基本了解</div>
              <div className="chat-bubble ai">那注意力机制呢？</div>
            </div>
          </article>

          <article className="how-card">
            <div className="how-head">
              <span>3.</span>
              <h3>生成你的专属补齐路径</h3>
            </div>
            <p>隐藏已掌握内容，只保留清晰、可执行的学习顺序。</p>
            <div className="how-body timeline">
              <div className="timeline-node">
                <span className="timeline-dot hollow" />
                <div>
                  <span className="stage-tag">开始</span>
                  <strong>补齐基础节点</strong>
                </div>
              </div>
              <div className="timeline-node">
                <span className="timeline-dot" />
                <div>
                  <span className="stage-tag">进阶</span>
                  <strong>学习中间依赖</strong>
                </div>
              </div>
              <div className="timeline-node">
                <span className="timeline-dot goal" />
                <div>
                  <span className="stage-tag">目标</span>
                  <strong>开始学习目标知识</strong>
                </div>
              </div>
            </div>
          </article>
        </div>
      </section>

      <div className="notice">
        <strong>Mock 演示说明：</strong>
        当前页面不接入真实大模型、知乎 API 或登录；题库、生成过程与资料均为本地模拟，
        仅用于验证页面结构与交互体验。
      </div>
    </>
  )
}
