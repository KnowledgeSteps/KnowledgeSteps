import type { CompletionResult, Question } from '../../api/types'
import { ApiError } from '../../api/types'
import type { Explanation, KnowledgeCardItem } from '../../api/reading'
import type { ReadingServices } from './ReadingServices'
import { ANSWER_OPTIONS } from '../../constants/answerOptions'
import { tutorialExample } from './tutorialExample'

const definitions = [
  ['vector', '向量与坐标', '用坐标描述方向和位移，理解向量的加法与数乘。', 0],
  ['arithmetic', '代数运算', '掌握实数、分配律以及合并同类项等基本计算规则。', 0],
  ['equation', '一次方程', '理解未知数、等式和通过等价变形求解方程的方法。', 0],
  ['combination', '线性组合', '把向量分别乘以系数再相加，得到新的向量。', 1],
  ['system', '线性方程组', '用多个一次方程描述约束，通过消元寻找同时满足约束的解。', 1],
  ['linear-algebra', '线性代数', '研究向量、矩阵、线性方程组与线性变换之间的关系。', 2],
] as const
export const tutorialResult: CompletionResult = {
  sessionId: 'tutorial-linear-algebra', target: '线性代数', status: 'COMPLETED', missingCount: 5,
  nodes: definitions.map(([id, name, description, level]) => ({ id, name, description, level, isTarget: id === 'linear-algebra', answer: 'HEARD_OF', resourceLimit: 1, resourceCount: id === 'linear-algebra' ? 0 : 1, resourceStatus: id === 'linear-algebra' ? 'NOT_APPLICABLE' : 'READY' })),
  edges: [['vector', 'combination'], ['arithmetic', 'combination'], ['arithmetic', 'system'], ['equation', 'system'], ['combination', 'linear-algebra'], ['system', 'linear-algebra']].map(([from, to]) => ({ from, to })),
}
export const tutorialQuestions: Question[] = tutorialResult.nodes.filter(n => !n.isTarget).map(n => ({ questionId: `tutorial-${n.id}`, nodeId: n.id, nodeName: n.name, questionText: `你了解${n.name}吗？`, hint: n.description, options: ANSWER_OPTIONS, checks: {}, answer: null }))
const date = '2026-09-14T00:00:00Z'
const content = (id: string) => id === 'vector' ? tutorialExample.overview : `## ${tutorialResult.nodes.find(n => n.id === id)?.name}\n\n${tutorialResult.nodes.find(n => n.id === id)?.description}\n\n这是教程预先准备的知识点说明。点击向量与坐标节点，可以继续体验划词解释。`
export function createTutorialServices(notify: () => void) {
  let doubt: Explanation | null = { id: 'tutorial-doubt', sessionId: 'tutorial-linear-algebra', nodeId: 'vector', nodeName: '向量与坐标', sessionTarget: '线性代数', quote: tutorialExample.quote, explanationMarkdown: tutorialExample.explanation, sourceTitle: '知阶教程示例', sourceUrl: null, createdAt: date, understood: false, saved: true }
  const favorites = new Map<string, KnowledgeCardItem>()
  const state = { savedDoubt: false, understood: false, favorite: false }
  const services: ReadingServices = {
    demo: true,
    getNodeOverview: async (_session, id) => ({ contentMarkdown: content(id), generatedAt: date, saved: favorites.has(id) }),
    getNodeResources: async (_session, id) => ({ nodeId: id, nodeName: tutorialResult.nodes.find(n => n.id === id)!.name, reason: '', resourceStatus: 'READY', resources: [{ id: `tutorial-resource-${id}`, title: '知阶示例资料 · '+tutorialResult.nodes.find(n => n.id === id)!.name, summary: content(id), url: '', authorName: '知阶教程', contentDate: '2026-09-14', voteCount: null, recommendationReason: '适合巩固基础' }] }),
    saveKnowledgeCard: async (_session, id) => {
      const node = tutorialResult.nodes.find(n => n.id === id)!
      favorites.set(id, { nodeId: id, nodeName: node.name, sessionId: 'tutorial-linear-algebra', sessionTarget: '线性代数', description: node.description, contentMarkdown: content(id), generatedAt: date, savedAt: date, understood: false })
      state.favorite = favorites.size > 0; notify()
      return { contentMarkdown: content(id), generatedAt: date, saved: true }
    },
    removeKnowledgeCard: async id => { favorites.delete(id); state.favorite = favorites.size > 0; notify() },
    getAllKnowledgeCards: async () => ({ items: [...favorites.values()], total: favorites.size, pageSize: 20 }),
    markKnowledgeCard: async (id, understood) => { const item = favorites.get(id); if (item) favorites.set(id, { ...item, understood }); notify() },
    explainQuote: async (_session, _node, body) => {
      if (!tutorialExample.quote.includes(body.quote) && !body.quote.includes(tutorialExample.quote)) throw new ApiError(400, 'TUTORIAL_QUOTE', '请选中教程中的“向量相加时……”这句话，体验预先准备的示例解释。')
      doubt = { id: 'tutorial-doubt', sessionId: 'tutorial-linear-algebra', nodeId: 'vector', nodeName: '向量与坐标', sessionTarget: '线性代数', quote: body.quote, explanationMarkdown: tutorialExample.explanation, sourceTitle: '知阶教程示例', sourceUrl: null, createdAt: date, understood: false, saved: false }
      return doubt
    },
    saveDoubt: async () => { if (!doubt) throw new Error('请先查看示例解释'); doubt = { ...doubt, saved: true }; state.savedDoubt = true; notify(); return doubt },
    getAllDoubts: async () => ({ items: doubt?.saved ? [doubt] : [], total: doubt?.saved ? 1 : 0, pageSize: 20 }),
    updateDoubt: async (_id, understood) => { if (!doubt) throw new Error('疑惑已删除'); doubt = { ...doubt, understood }; state.understood = understood; notify(); return doubt },
    deleteDoubt: async () => { doubt = null; state.savedDoubt = false; state.understood = false; notify() },
  }
  return { services, state }
}
