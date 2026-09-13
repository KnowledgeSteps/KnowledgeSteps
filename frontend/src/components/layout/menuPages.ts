// Load the destination while the current page stays readable, before fading it out.
export const menuPageLoaders = {
  '/admin/analytics': () => import('../../pages/AnalyticsPage'),
  '/history': () => import('../../pages/SessionHistoryPage'),
  '/doubts': () => import('../../pages/DoubtsPage'),
  '/knowledge-cards': () => import('../../pages/KnowledgeCardsPage'),
}
export type MenuPagePath = keyof typeof menuPageLoaders
