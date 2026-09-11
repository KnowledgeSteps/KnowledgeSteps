import type { CSSProperties } from 'react'
import '../../design/waiting.css'
import { Progress, Steps } from 'antd'
import { CompassOutlined } from '@ant-design/icons'
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
    desc: '把目标拆成它依赖的知识台阶',
  },
  {
    key: 'GENERATING_QUESTIONS',
    title: '生成自评问卷',
    desc: '准备几个简短问题确认你的基础',
  },
]

export function WaitingView({ session, graphPercent }: { session: SessionDetail; graphPercent: number }) {
  const steps = STEPS
  const activeIndex = session.status === 'SEARCHING_RESOURCES' ? 0 : graphPercent < 100 ? 0 : 1
  const { processedNodes, totalNodes } = session.progress
  return (
    <section className="waiting enter">
      <div className="waiting-blob-card">
        <div className="waiting-blob-bg" aria-hidden="true" />
        <div className="waiting-blob" aria-hidden="true" />
        <div className="waiting-content">
        <div className="engine-top"><div><h2><CompassOutlined aria-hidden="true" /> 知阶正在为你寻路</h2><p>目标：{session.target}</p></div></div>
        <>{session.status === 'SEARCHING_RESOURCES' ? <h3 className="resource-search-title">按熟悉程度整理资料</h3> : <Steps className="waiting-steps" style={{ '--graph-progress': `${graphPercent}%` } as CSSProperties} orientation="vertical" current={Math.max(0, activeIndex)} items={steps.map((step) => ({
          title: <span className="waiting-step-title"><span>{step.title}</span>{step.key === 'GENERATING_QUESTIONS' && session.status === 'GENERATING_QUESTIONS' && graphPercent >= 100 && <span className="question-generation-spinner" role="status" aria-label="正在生成自评问卷" />}</span>,
          content: <div><p>{step.desc}</p>{step.key === 'GENERATING_GRAPH' && <GraphProgress percent={graphPercent} />}</div>,
        }))} />}</>
        {session.status === 'SEARCHING_RESOURCES' && totalNodes > 0 && <div className="search-progress">
          <div className="between"><span>已处理节点</span><strong>{processedNodes} / {totalNodes}</strong></div>
          <Progress percent={Math.min(100, processedNodes / totalNodes * 100)} showInfo={false} />
        </div>}
        <p className="hint">{isMockMode ? '当前为 Mock 学习数据，生成过程不调用真实模型或知乎搜索。' : '生成需要一点时间，你可以稍后回到本页面查看进度。'}</p>
        </div>
      </div>
    </section>
  )
}

function GraphProgress({ percent }: { percent: number }) {
  const complete = percent >= 100
  const displayed = complete ? 100 : Math.floor(percent)
  return <div className="graph-generation-progress">
    <div className="graph-block-progress" role="progressbar" aria-label={complete ? '图谱已生成' : '图谱生成预估进度'} aria-valuemin={0} aria-valuemax={100} aria-valuenow={displayed}>
      {Array.from({ length: 24 }, (_, index) => <span className="graph-progress-block" key={index} aria-hidden="true"><i style={{ transform: `scaleY(${Math.max(0, Math.min(1, percent / 100 * 24 - index))})` }} /></span>)}
    </div>
    <div className="graph-progress-number"><strong>{displayed}%</strong><span>{complete ? '图谱已生成' : '预估进度'}</span></div>
    <small className="graph-progress-note">{complete ? '图谱已就绪，正在准备自评问卷' : '图谱正在生成'}</small>
  </div>
}
