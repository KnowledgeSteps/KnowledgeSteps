import { useEffect, useRef, useState } from 'react'
import { Alert, Button, Drawer, Modal, Progress, Result, Skeleton, Space, Tag } from 'antd'
import { CompassOutlined, ClearOutlined } from '@ant-design/icons'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import { useRecoverableRead } from '../hooks/useRecoverableRead'
import { changeTutorial, getTutorial, type TutorialProgress } from '../api/tutorial'
import type { KnowledgeNode } from '../api/types'
import { ReadingServicesContext } from '../components/reading/ReadingServices'
import { createTutorialServices, tutorialQuestions, tutorialResult } from '../components/reading/tutorialServices'
import { PathView } from '../components/result/PathView'
import { ResultOverview } from '../components/result/ResultOverview'
import { ResourcesDrawer } from '../components/result/ResourcesDrawer'
import { QuestionPanel } from '../components/quiz/QuestionPanel'
import { StatusRail } from '../components/quiz/StatusRail'
import { DoubtsPage } from './DoubtsPage'
import { KnowledgeCardsPage } from './KnowledgeCardsPage'
import { HomePage } from './HomePage'
import { TutorialSpotlight } from '../components/reading/TutorialSpotlight'
import '../design/quiz.css'
import '../design/tutorial.css'

const titles = ['完成基础自评', '认识知识图谱', '解释并保存疑惑', '回看你的疑惑', '收藏知识卡片']
export function TutorialPage() {
  const auth = useAuth()
  return <TutorialContent key={auth.user?.userId} />
}
function TutorialContent() {
  const navigate = useNavigate()
  const { data, error, reload } = useRecoverableRead('tutorial', getTutorial)
  const [updated, setUpdated] = useState<TutorialProgress | null>(null)
  const current = updated && (!data || updated.revision > data.revision) ? updated : data
  const step = current?.step ?? 0
  const [, refresh] = useState(0)
  const [demo, setDemo] = useState(() => createTutorialServices(() => refresh(n => n + 1)))
  const [questions, setQuestions] = useState(tutorialQuestions)
  const [homeEntered, setHomeEntered] = useState(false)
  const [graphVisited, setGraphVisited] = useState(false)
  const [index, setIndex] = useState(0)
  const [directory, setDirectory] = useState(false)
  const [openNode, setOpenNode] = useState<KnowledgeNode | null>(null)
  const [collection, setCollection] = useState(false)
  const [cardViewed, setCardViewed] = useState(false)
  const [returned, setReturned] = useState(false)
  const [busy, setBusy] = useState(false)
  const lock = useRef(false)
  const [failure, setFailure] = useState<string | null>(null)
  const [resetOpen, setResetOpen] = useState(false)
  const heading = useRef<HTMLHeadingElement>(null)
  const answered = questions.filter(q => q.answer !== null).length
  useEffect(() => {
    heading.current?.focus({ preventScroll: true })
    window.scrollTo({ top: 0, behavior: 'instant' })
  }, [step, homeEntered, collection, returned])
  async function change(action: 'advance' | 'reset') {
    if (!current || lock.current) return
    lock.current = true; setBusy(true); setFailure(null)
    try {
      const next = await changeTutorial(action, current.revision)
      setUpdated(next); setOpenNode(null); setCollection(false); setReturned(false); setResetOpen(false); setCardViewed(false)
      if (action === 'reset') { setGraphVisited(false); setHomeEntered(false); setQuestions(tutorialQuestions); setIndex(0); setDemo(createTutorialServices(() => refresh(n => n + 1))) }
    } catch (e) { setFailure(e instanceof Error ? e.message : '进度未保存，请重试。'); reload() }
    finally { lock.current = false; setBusy(false) }
  }
  const graph = <>
    <ResultOverview result={tutorialResult} />
    <PathView result={tutorialResult} onOpenNode={node => { setGraphVisited(true); setOpenNode(node) }} />
    <div className="result-note">结果来自你的自评，不代表能力水平。点击任意节点可以查看知识点卡片与资料。</div>
    <ResourcesDrawer sessionId="tutorial-rag" node={openNode} onClose={() => setOpenNode(null)} />
  </>
  return <ReadingServicesContext.Provider value={demo.services}><section className="tutorial-page">
    {current && !resetOpen && !busy && <TutorialSpotlight step={step} homeEntered={homeEntered} savedDoubt={demo.state.savedDoubt} understood={demo.state.understood} favorite={demo.state.favorite} collection={collection} graphVisited={graphVisited} cardViewed={cardViewed} />}
    <div className="tutorial-guide" role="region" aria-label="教程引导">
      <div className="tutorial-toolbar"><Tag icon={<CompassOutlined />}>新手教程 · 独立示例</Tag><Space wrap>
        <Button disabled={busy || !current} onClick={() => setResetOpen(true)}>重新开始</Button>
        <Button disabled={busy} onClick={() => navigate('/')}>退出教程</Button>
      </Space></div>
      <h2 ref={heading} tabIndex={-1}>{step === 5 ? '教程已完成' : `第 ${step + 1}/5 步 · ${step === 0 && !homeEntered ? '输入学习目标' : titles[step]}`}</h2>
      <Progress percent={step * 20} size="small" />
      <p>当前为新手教程，示例数据与个人记录分开。五个前置知识点按 3 → 2 排列，最后汇聚到学习目标 RAG。</p>
      {step === 0 && !homeEntered && <p>在下方“学习目标”输入 <strong>RAG</strong>，点击“开始寻路”，进入基础自评。</p>}
      {step === 1 && <><p>点击任意节点查看内容；找到“文本分块”，接下来体验划词解释。</p><Button type="primary" disabled={busy} onClick={() => void change('advance')}>继续体验划词解释</Button></>}
      {step === 2 && <><p>打开“文本分块”，选中“相邻文本块保留少量重叠……”这句话，点击“这段看不懂？”并解释、保存。也可点击卡片底部“解释一句话”粘贴该句。</p>
        <Button type="primary" disabled={!demo.state.savedDoubt || busy} onClick={() => void change('advance')}>进入疑惑本</Button></>}
      {step === 3 && <><p>点击“查看理解”，将这条疑惑标记为已理解。</p><Button type="primary" disabled={!demo.state.understood || busy} onClick={() => void change('advance')}>继续体验收藏卡片</Button></>}
      {step === 4 && <><p>在节点侧栏收藏知识点，再进入知识卡片页回看。所有收藏操作仅影响教程。</p>
        <Space wrap><Button disabled={!demo.state.favorite} onClick={() => { setCollection(true); setOpenNode(null) }}>进入知识卡片</Button>
          {collection && <Button type="primary" disabled={!demo.state.favorite || !cardViewed || busy} onClick={() => void change('advance')}>完成教程</Button>}</Space></>}
    </div>
    {failure && <Alert type="error" showIcon title={failure} action={<Button onClick={reload}>重新读取</Button>} />}
    {error && <Alert type="error" title="教程暂时无法读取" description={error.message} action={<Button onClick={reload}>重试</Button>} />}
    {!current && !error && <Skeleton active />}
    {current && step === 0 && !homeEntered && <HomePage onTutorialStart={() => setHomeEntered(true)} />}
    {current && step === 0 && homeEntered && <div className="twocol quiz-layout">
      <div className="quiz-surface-blob" aria-hidden="true" /><div className="quiz-surface-glass" aria-hidden="true" />
      <section className="question quiz-main" aria-label="知识自评"><div className="between"><span>已回答 <em>{answered}</em> / 5</span>
        <Button type="text" icon={<ClearOutlined />} disabled={busy || !answered} onClick={() => { setQuestions(tutorialQuestions); setIndex(0) }}>清空所有选择</Button></div>
        <Progress percent={answered * 20} showInfo={false} className="quiz-progress" />
        <div className="mentor"><CompassOutlined className="spark" /><div><strong>知阶正在确认你的基础</strong><p>没有标准答案，按真实情况选择就好。教程使用固定的 RAG 示例结果。</p></div></div>
        <QuestionPanel question={questions[index]} index={index} total={5} saving={busy} onAnswer={answer => { setQuestions(previous => previous.map((q, i) => i === index ? { ...q, answer } : q)); setIndex(Math.min(4, index + 1)) }} onBack={() => setIndex(Math.max(0, index - 1))} canBack={index > 0} onOpenDirectory={() => setDirectory(true)} />
        {answered === 5 && <Button className="quiz-result-button" disabled={busy} onClick={() => void change('advance')}>查看结果</Button>}
      </section>
      <div className="quiz-desktop-directory"><StatusRail questions={questions} currentIndex={index} disabled={busy} onJump={setIndex} /></div>
      <Drawer title="题目目录" placement="bottom" size="min(78dvh, 640px)" className="quiz-directory-drawer" open={directory} onClose={() => setDirectory(false)}>
        <StatusRail questions={questions} currentIndex={index} onJump={i => { setIndex(i); setDirectory(false) }} />
      </Drawer>
    </div>}
    {current && (step === 1 || step === 2 || (step === 4 && !collection) || (step === 3 && returned)) && graph}
    {current && step === 3 && !returned && <DoubtsPage onReturn={() => setReturned(true)} />}
    {current && step === 3 && returned && <Button onClick={() => setReturned(false)}>返回疑惑本</Button>}
    {current && step === 4 && collection && <KnowledgeCardsPage onReturn={() => setCollection(false)} onCardOpened={() => setCardViewed(true)} />}
    {current && step === 5 && <Result status="success" title="新手教程已完成" subTitle="示例数据没有加入你的个人记录。" extra={<Button type="primary" onClick={() => navigate('/')}>开始我的寻路</Button>} />}
    <Modal open={resetOpen} title="重新开始教程？" onCancel={() => !busy && setResetOpen(false)} onOk={() => void change('reset')} confirmLoading={busy} okText="重新开始" cancelText="取消">
      <p>将重置教程进度，个人寻路、疑惑和收藏不受影响。</p>{failure && <Alert type="error" title={failure} />}
    </Modal>
  </section></ReadingServicesContext.Provider>
}
