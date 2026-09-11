import type { SessionDetail } from '../../api/types'
import { isMockMode } from '../../api/config'

const STEPS: Array<{
  key: SessionDetail['status']
  title: string
  desc: string
}> = [
  {
    key: 'GENERATING_GRAPH',
    title: '推导前置知识',
    desc: '正在把目标拆成它依赖的知识台阶',
  },
  {
    key: 'SEARCHING_RESOURCES',
    title: '检索学习资料',
    desc: '正在为每个前置节点寻找知乎内容',
  },
  {
    key: 'GENERATING_QUESTIONS',
    title: '生成自评问卷',
    desc: '正在准备几个简短问题确认你的基础',
  },
]

export function WaitingView({ session }: { session: SessionDetail }) {
  const activeIndex = STEPS.findIndex((step) => step.key === session.status)
  const progress = session.progress
  const searching = session.status === 'SEARCHING_RESOURCES'
  const ratio =
    progress.totalNodes > 0
      ? Math.min(1, progress.processedNodes / progress.totalNodes)
      : 0

  return (
    <section className="waiting enter">
      <div className="waiting-card">
        <div className="engine-top">
          <span className="spark">✧</span>
          <div>
            <h3 style={{ margin: 0 }}>知阶正在为你寻路</h3>
            <small>目标：{session.target}</small>
          </div>
        </div>

        <ol className="phase-list">
          {STEPS.map((step, index) => {
            const state =
              index < activeIndex
                ? 'done'
                : index === activeIndex
                  ? 'active'
                  : 'todo'
            return (
              <li key={step.key} className={`phase ${state}`}>
                <span className="phase-mark">
                  {state === 'done' ? '✓' : index + 1}
                </span>
                <div>
                  <strong>{step.title}</strong>
                  <small>{step.desc}</small>
                </div>
                {state === 'active' && <em className="phase-live">进行中</em>}
              </li>
            )
          })}
        </ol>

        {searching && progress.totalNodes > 0 && (
          <div className="search-progress">
            <div className="between">
              <span className="muted">已检索前置资料</span>
              <strong>
                {progress.processedNodes} / {progress.totalNodes}
              </strong>
            </div>
            <div className="progress" style={{ marginTop: 10 }}>
              <i style={{ width: `${ratio * 100}%` }} />
            </div>
          </div>
        )}

        <p className="hint" style={{ marginTop: 20 }}>
          {isMockMode
            ? '生成通常只需要几秒。本页面为 Mock 演示，未接入真实模型与知乎搜索。'
            : '生成需要一点时间。你可以稍后回到本页面查看进度。'}
        </p>
      </div>
    </section>
  )
}
