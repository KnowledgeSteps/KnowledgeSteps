import { KnowledgeCard } from '../ui/KnowledgeCard'
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
    desc: '正在把目标拆成它依赖的知识台阶',
  },
  {
    key: 'GENERATING_QUESTIONS',
    title: '生成自评问卷',
    desc: '正在准备几个简短问题确认你的基础',
  },
]

export function WaitingView({ session }: { session: SessionDetail }) {
  const steps = session.status === 'SEARCHING_RESOURCES' ? [{ key: 'SEARCHING_RESOURCES', title: '按熟悉程度整理资料', desc: '非常了解不搜索，其余节点最多提供 2、3、5 条资料' }] : STEPS
  const activeIndex = steps.findIndex((step) => step.key === session.status)
  const { processedNodes, totalNodes } = session.progress
  return (
    <section className="waiting enter">
      <KnowledgeCard className="waiting-card" icon={<CompassOutlined />}>
        <div className="engine-top"><div><h2>知阶正在为你寻路</h2><p>目标：{session.target}</p></div></div>
        <Steps orientation="vertical" current={Math.max(0, activeIndex)} items={steps.map((step) => ({ title: step.title, content: step.desc }))} />
        {session.status === 'SEARCHING_RESOURCES' && totalNodes > 0 && <div className="search-progress">
          <div className="between"><span>已处理节点（含无需资料的节点）</span><strong>{processedNodes} / {totalNodes}</strong></div>
          <Progress percent={Math.min(100, processedNodes / totalNodes * 100)} showInfo={false} />
        </div>}
        <p className="hint">{isMockMode ? '当前为 Mock 学习数据，生成过程不调用真实模型或知乎搜索。' : '生成需要一点时间，你可以稍后回到本页面查看进度。'}</p>
      </KnowledgeCard>
    </section>
  )
}
