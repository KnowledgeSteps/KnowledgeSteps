import { useEffect, useState, useSyncExternalStore, type CSSProperties } from 'react'
import { createPortal } from 'react-dom'
import { Button, Space, Tour } from 'antd'
import { useNavigate } from 'react-router-dom'
import { loadingController } from '../ui/loadingController'

interface Focus { element: HTMLElement; title: string; description: string; introduction?: string }
function visible(selector: string): HTMLElement | null {
  return [...document.querySelectorAll<HTMLElement>(selector)].find(el => el.getClientRects().length > 0 && !el.closest('[aria-hidden="true"]')) ?? null
}
function button(label: string, scope = '.tutorial-page'): HTMLElement | null {
  return [...document.querySelectorAll<HTMLButtonElement>(`${scope} button`)].find(el => el.getClientRects().length > 0 && !el.disabled && el.textContent?.trim() === label) ?? null
}
/** Observe the actual shared surfaces, including Drawer/Modal portals, without intercepting business actions. */
export function TutorialSpotlight({ step, homeEntered, savedDoubt, understood, favorite, collection, graphVisited, cardViewed }: {
  step: number; homeEntered: boolean; savedDoubt: boolean; understood: boolean; favorite: boolean; collection: boolean; graphVisited: boolean; cardViewed: boolean
}) {
  const navigate = useNavigate()
  const loading = useSyncExternalStore(loadingController.subscribe, loadingController.getSnapshot)
  const [paused, setPaused] = useState(false)
  const [focus, setFocus] = useState<Focus | null>(null)
  const [introduced, setIntroduced] = useState<string[]>([])
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined
    function inspect() {
      let next: Focus | null = null
      const set = (element: HTMLElement | null, title: string, description: string) => { if (element) next = { element, title, description } }
      const modal = visible('.reading-modal .ant-modal-content, .reading-modal .ant-modal-container')
      const drawer = visible('.reading-drawer .ant-drawer-body')
      const detail = visible('.doubt-detail-modal .ant-modal-body')
      const error = visible('.tutorial-page .ant-alert-error, .reading-modal .ant-alert-error, .reading-error')
      if (error) set(error, '先处理这个提示', '根据提示重试。也可以暂停引导，自由检查当前页面。')
      else if (modal) {
        if (savedDoubt) set(visible('.reading-modal .ant-modal-close'), '疑惑已保存', '点击关闭解释，接下来到疑惑本回看。')
        else if (button('保存到疑惑本', '.reading-modal')) set(button('保存到疑惑本', '.reading-modal'), '留下这条疑惑', '点击“保存到疑惑本”，将原句和示例解释一起留下。')
        else set(visible('.reading-modal .reading-explain-controls'), '看看这句话的解释', '确认上方句子后，点击“解释这段话”。教程展示预先准备的解释。')
        const input = visible('#reading-quote-input') as HTMLTextAreaElement | null
        if (!savedDoubt && input && !input.value.trim()) set(input, '输入不理解的句子', '粘贴这句：向量相加时，对应位置的坐标分别相加。然后点击解释。')
      } else if (detail) {
        if (step === 3) set(understood ? visible('.doubt-detail-modal .ant-modal-close') : button('标记已理解', '.doubt-detail-modal'), understood ? '已经标记完成' : '确认你已经理解', understood ? '关闭弹窗，继续体验知识卡片。' : '阅读解释后，点击“标记已理解”。')
        else set(visible('.doubt-detail-modal .ant-modal-close'), '随时回看收藏', '这里可以阅读完整知识点卡片。关闭弹窗后完成教程。')
      } else if (drawer) {
        if (step === 1) set(visible('.reading-drawer .ant-drawer-close'), '这就是节点详情', '这里有知识点卡片和相关资料。先关闭侧栏，继续下一步。')
        else if ((step === 2 && savedDoubt) || (step === 4 && favorite)) set(visible('.reading-drawer .ant-drawer-close'), '操作已保存', '关闭侧栏，到对应的列表中回看。')
        else if (step === 4) set(visible('.reading-overview .favorite-card-button'), '收藏这张知识卡片', '点击“收藏卡片”，以后可以从知识卡片页再次阅读。')
        else {
          const paragraph = [...document.querySelectorAll<HTMLElement>('.reading-overview .reading-selectable p')].find(el => el.textContent?.includes('向量相加时'))
          const selection = visible('.reading-selection-actions')
          if (selection) set(selection, '这段看不懂？', '点击这个选项，打开句子解释。')
          else set(paragraph ?? visible('.reading-overview-footer'), '选中这句不懂的话', '用鼠标拖选高亮句子，手机可长按选字。选中后点击“这段看不懂？”。')
        }
      } else if (step === 0 && !homeEntered) {
        const input = visible('#learning-goal') as HTMLInputElement | null
        const valid = input?.value.trim().toUpperCase() === '线性代数'
        set(valid ? visible('.goal-form button') : visible('.goal-form'), valid ? '开始这次示例寻路' : '先告诉知阶你想学什么', valid ? '点击“开始寻路”，接下来了解你的基础。' : '在“学习目标”中输入 线性代数。这里与平时寻路的操作相同。')
      } else if (step === 0) {
        const result = button('查看结果')
        set(result ?? visible('.question-panel'), result ? '自评完成' : '选择你的熟悉程度', result ? '点击“查看结果”，看看 线性代数 的前置知识图谱。' : '根据自己的情况点击一个选项，选完会进入下一题。')
      } else if (step === 1) {
        set(graphVisited ? button('继续体验划词解释') : visible('[aria-label="向量与坐标，查看 1 条资料"]'), graphVisited ? '继续体验阅读' : '打开一个知识点', graphVisited ? '点击这里，体验选句解释和保存疑惑。' : '点击“向量与坐标”节点，查看知识点卡片和资料。')
      } else if (step === 2) set(savedDoubt ? button('进入疑惑本') : visible('[aria-label="向量与坐标，查看 1 条资料"]'), savedDoubt ? '去疑惑本回看' : '打开向量与坐标', savedDoubt ? '点击进入疑惑本，找到刚保存的句子。' : '点击节点，然后在知识点卡片中选中不理解的句子。')
      else if (step === 3) set(understood ? button('继续体验收藏卡片') : button('查看理解'), understood ? '接下来收藏知识' : '回看你的疑惑', understood ? '点击这里进入最后一步。' : '点击“查看理解”，阅读保存的解释并标记已理解。')
      else if (step === 4) set(collection ? button(cardViewed ? '完成教程' : '查看卡片') : favorite ? button('进入知识卡片') : visible('[aria-label="向量与坐标，查看 1 条资料"]'), collection ? (cardViewed ? '完成这次体验' : '打开刚收藏的卡片') : favorite ? '去知识卡片回看' : '收藏值得记住的知识', collection ? (cardViewed ? '你已经回看了收藏，点击完成教程。' : '点击“查看卡片”，阅读刚才收藏的知识点。') : favorite ? '点击进入知识卡片，查看刚才的收藏。' : '点击“向量与坐标”，再点击卡片右上角的收藏按钮。')
      const introduce = (key: string, selector: string, title: string, description: string) => {
        const element = visible(selector)
        if (!introduced.includes(key) && element) { next = { element, title, description, introduction: key }; return true }
        return false
      }
      if (!error) {
        if (modal && !savedDoubt && button('保存到疑惑本', '.reading-modal')) {
          introduce('explanation', '.reading-explanation-card .reading-markdown', '先看看这段解释', '这里用通俗的例子解释你选中的句子。可以上下滚动阅读；看完点击“下一步”，再把原句和解释保存到疑惑本。')
        } else if (detail && step === 3 && !understood) {
          introduce('doubt', '.doubt-detail-modal .reading-markdown', '回看原句和解释', '这里保留了你的疑惑原句、解释，以及所属寻路和知识点。先阅读内容，理解后再进行标记。')
        } else if (detail && step === 4) {
          introduce('saved-card', '.doubt-detail-modal .reading-markdown', '阅读收藏的知识卡片', '收藏保存了这个知识点的完整讲解，方便随时复习。可以上下滚动阅读，看完点击“下一步”。')
        } else if (drawer && step === 1) {
          if (!introduce('node-card', '.reading-overview .reading-markdown', '认识知识点卡片', '卡片介绍这个知识点是什么、为什么需要它，以及它与学习目标的关系。先阅读讲解，再点击“下一步”了解相关资料。')) {
            introduce('resources', '.reading-resources', '认识相关资料', '这里列出这个知识点的学习资料。平时点击资料可以阅读内容，有知乎原文入口时也可以前往原文。看完点击“下一步”，再关闭侧栏。')
          }
        }
      }
      setFocus(previous => previous?.element === next?.element && previous?.title === next?.title && previous?.description === next?.description ? previous : next)
    }
    const schedule = () => { clearTimeout(timer); timer = setTimeout(inspect, 100) }
    const observer = new MutationObserver(records => {
      if (records.some(record => !(record.target instanceof Element && record.target.closest('.tutorial-spotlight')))) schedule()
    })
    observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['disabled', 'class', 'aria-hidden'], characterData: true })
    document.addEventListener('input', schedule)
    document.addEventListener('selectionchange', schedule)
    schedule()
    return () => { clearTimeout(timer); observer.disconnect(); document.removeEventListener('input', schedule); document.removeEventListener('selectionchange', schedule) }
  }, [step, homeEntered, savedDoubt, understood, favorite, collection, graphVisited, cardViewed, introduced])
  // A measured, non-scrolling target prevents Tour from scrolling overflow-hidden
  // ticket ancestors. Refresh its identity as animations and nested scrolls move it.
  const [anchor, setAnchor] = useState<HTMLElement | null>(null)
  useEffect(() => {
    if (!focus || paused || loading.visible) return
    let frame = 0
    let previous = ''
    const target = focus.element
    const rect = target.getBoundingClientRect()
    const scroller = target.closest<HTMLElement>('.reading-modal-scroll, .ant-drawer-body, .ant-modal-body')
    if (scroller) {
      const bounds = scroller.getBoundingClientRect()
      if (rect.bottom > bounds.bottom || rect.top < bounds.top) scroller.scrollTop += rect.top - bounds.top - 24
    } else if (rect.top >= window.innerHeight || rect.bottom <= 0) {
      window.scrollBy({ top: rect.top - 220, behavior: 'instant' })
    }
    function measure() {
      if (!target.isConnected) return
      const box = target.getBoundingClientRect()
      const signature = [box.x, box.y, box.width, box.height].map(n => Math.round(n * 10)).join(',')
      if (signature !== previous) {
        previous = signature
        const proxy = document.createElement('span')
        proxy.getBoundingClientRect = () => box
        proxy.scrollIntoView = () => {}
        setAnchor(proxy)
      }
      frame = requestAnimationFrame(measure)
    }
    frame = requestAnimationFrame(measure)
    return () => cancelAnimationFrame(frame)
  }, [focus, paused, loading.visible])
  useEffect(() => {
    if (!focus || paused || loading.visible || step >= 5) return
    const guard = (event: MouseEvent) => {
      const target = event.target
      if (!(target instanceof Element) || focus.element.contains(target) || target.closest('.ant-tour, .tutorial-resume')) return
      event.preventDefault()
      event.stopPropagation()
    }
    document.addEventListener('click', guard, true)
    return () => document.removeEventListener('click', guard, true)
  }, [focus, paused, loading.visible, step])
  if (step >= 5) return null
  return createPortal(<div className="tutorial-overlay">
    {paused && <Button className="tutorial-resume" type="primary" onClick={() => setPaused(false)}>继续高亮引导</Button>}
    <Tour getPopupContainer={false} open={!paused && !loading.visible && !!focus && !!anchor} current={0} rootClassName={`tutorial-spotlight${step === 0 && homeEntered ? " tutorial-quiz-tip" : ""}`}
      zIndex={2000} disabledInteraction={false} animated={false} mask={{ color: 'var(--tutorial-mask)' }} gap={{ offset: 8, radius: 10 }}
      scrollIntoViewOptions={{ block: 'center', behavior: 'instant' }} onClose={() => setPaused(true)}
      steps={focus ? [{ target: () => anchor!, title: focus.title, description: focus.description, placement: 'bottom', style: { '--tutorial-tip-top': anchor && anchor.getBoundingClientRect().top >= 0 && anchor.getBoundingClientRect().bottom < 160 ? `${anchor.getBoundingClientRect().bottom + 20}px` : '12px' } as CSSProperties }] : []}
      actionsRender={() => <Space wrap>{focus?.introduction && <Button size="small" type="primary" onClick={() => setIntroduced(previous => [...previous, focus.introduction!])}>下一步</Button>}<Button size="small" onClick={() => setPaused(true)}>暂停引导</Button><Button size="small" type="text" onClick={() => navigate('/')}>退出教程</Button></Space>} />
  </div>, document.body)
}
