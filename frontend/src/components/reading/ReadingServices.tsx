import { createContext, useContext } from 'react'
import * as reading from '../../api/reading'
import { getNodeResources } from '../../api/sessions'

export const liveReadingServices = {
  getNodeOverview: reading.getNodeOverview, saveKnowledgeCard: reading.saveKnowledgeCard,
  removeKnowledgeCard: reading.removeKnowledgeCard, explainQuote: reading.explainQuote,
  saveDoubt: reading.saveDoubt, getAllDoubts: reading.getAllDoubts,
  updateDoubt: reading.updateDoubt, deleteDoubt: reading.deleteDoubt,
  getAllKnowledgeCards: reading.getAllKnowledgeCards, markKnowledgeCard: reading.markKnowledgeCard,
  getNodeResources, demo: false,
}
export type ReadingServices = typeof liveReadingServices
export const ReadingServicesContext = createContext<ReadingServices>(liveReadingServices)
export function useReadingServices() { return useContext(ReadingServicesContext) }
