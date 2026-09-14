import type { CompletionResult, Question } from '../../api/types'
import { ApiError } from '../../api/types'
import type { Explanation, KnowledgeCardItem } from '../../api/reading'
import type { ReadingServices } from './ReadingServices'
import { ANSWER_OPTIONS } from '../../constants/answerOptions'
import { tutorialExample } from './tutorialExample'

const definitions = [
  ['chunk', '文本分块', '把长文档拆成语义相对完整的小段，便于检索和提供上下文。', 0],
  ['embedding', '词嵌入', '把文本转换为向量，让计算机可以比较语义相似程度。', 0],
  ['prompt', '提示词', '用清楚的指令告诉模型任务、参考资料和回答要求。', 0],
  ['retrieval', '向量检索', '使用文本向量寻找与问题含义相近的资料片段。', 1],
  ['context', '上下文组织', '将检索片段与问题组织成模型可参考的输入。', 1],
  ['rag', 'RAG', '先检索外部资料，再结合资料生成回答。', 2],
] as const
export const tutorialResult: CompletionResult = {
  sessionId: 'tutorial-rag', target: 'RAG', status: 'COMPLETED', missingCount: 5,
  nodes: definitions.map(([id, name, description, level]) => ({ id, name, description, level, isTarget: id === 'rag', answer: 'HEARD_OF', resourceLimit: 1, resourceCount: id === 'rag' ? 0 : 1, resourceStatus: id === 'rag' ? 'NOT_APPLICABLE' : 'READY' })),
  edges: [['chunk', 'retrieval'], ['embedding', 'retrieval'], ['chunk', 'context'], ['prompt', 'context'], ['retrieval', 'rag'], ['context', 'rag']].map(([from, to]) => ({ from, to })),
}
export const tutorialQuestions: Question[] = tutorialResult.nodes.filter(n => !n.isTarget).map(n => ({ questionId: `tutorial-${n.id}`, nodeId: n.id, nodeName: n.name, questionText: `你了解${n.name}吗？`, hint: n.description, options: ANSWER_OPTIONS, answer: null }))
const date = '2026-09-14T00:00:00Z'
const content = (id: string) => id === 'chunk' ? tutorialExample.overview : `## ${tutorialResult.nodes.find(n => n.id === id)?.name}\n\n${tutorialResult.nodes.find(n => n.id === id)?.description}\n\n这是教程预先准备的知识点说明。点击文本分块节点，可以继续体验划词解释。`
export function createTutorialServices(notify: () => void) {
  let doubt: Explanation | null = { id: 'tutorial-doubt', sessionId: 'tutorial-rag', nodeId: 'chunk', nodeName: '文本分块', sessionTarget: 'RAG', quote: tutorialExample.quote, explanationMarkdown: tutorialExample.explanation, sourceTitle: '知阶教程示例', sourceUrl: null, createdAt: date, understood: false, saved: true }
  const favorites = new Map<string, KnowledgeCardItem>()
  const state = { savedDoubt: false, understood: false, favorite: false }
  const services: ReadingServices = {
    demo: true,
    getNodeOverview: async (_session, id) => ({ contentMarkdown: content(id), generatedAt: date, saved: favorites.has(id) }),
    getNodeResources: async (_session, id) => ({ nodeId: id, nodeName: tutorialResult.nodes.find(n => n.id === id)!.name, reason: '', resourceStatus: 'READY', resources: [{ id: `tutorial-resource-${id}`, title: '知阶示例资料 · '+tutorialResult.nodes.find(n => n.id === id)!.name, summary: content(id), url: '', authorName: '知阶教程', contentDate: '2026-09-14', voteCount: null }] }),
    saveKnowledgeCard: async (_session, id) => {
      const node = tutorialResult.nodes.find(n => n.id === id)!
      favorites.set(id, { nodeId: id, nodeName: node.name, sessionId: 'tutorial-rag', sessionTarget: 'RAG', description: node.description, contentMarkdown: content(id), generatedAt: date, savedAt: date, understood: false })
      state.favorite = favorites.size > 0; notify()
      return { contentMarkdown: content(id), generatedAt: date, saved: true }
    },
    removeKnowledgeCard: async id => { favorites.delete(id); state.favorite = favorites.size > 0; notify() },
    getAllKnowledgeCards: async () => ({ items: [...favorites.values()], total: favorites.size, pageSize: 20 }),
    markKnowledgeCard: async (id, understood) => { const item = favorites.get(id); if (item) favorites.set(id, { ...item, understood }); notify() },
    explainQuote: async (_session, _node, body) => {
      if (!tutorialExample.quote.includes(body.quote) && !body.quote.includes(tutorialExample.quote)) throw new ApiError(400, 'TUTORIAL_QUOTE', '请选中教程中的“相邻文本块保留少量重叠……”这句话，体验预先准备的示例解释。')
      doubt = { id: 'tutorial-doubt', sessionId: 'tutorial-rag', nodeId: 'chunk', nodeName: '文本分块', sessionTarget: 'RAG', quote: body.quote, explanationMarkdown: tutorialExample.explanation, sourceTitle: '知阶教程示例', sourceUrl: null, createdAt: date, understood: false, saved: false }
      return doubt
    },
    saveDoubt: async () => { if (!doubt) throw new Error('请先查看示例解释'); doubt = { ...doubt, saved: true }; state.savedDoubt = true; notify(); return doubt },
    getAllDoubts: async () => ({ items: doubt?.saved ? [doubt] : [], total: doubt?.saved ? 1 : 0, pageSize: 20 }),
    updateDoubt: async (_id, understood) => { if (!doubt) throw new Error('疑惑已删除'); doubt = { ...doubt, understood }; state.understood = understood; notify(); return doubt },
    deleteDoubt: async () => { doubt = null; state.savedDoubt = false; state.understood = false; notify() },
  }
  return { services, state }
}
