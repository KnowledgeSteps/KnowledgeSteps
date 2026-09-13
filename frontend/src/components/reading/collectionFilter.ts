export interface CollectionFilter { status: 'all' | 'understood' | 'pending'; session?: string; node?: string }
export const emptyCollectionFilter: CollectionFilter = { status: 'all' }
export interface CollectionEntry { sessionId: string; sessionTarget?: string; nodeId: string; nodeName: string; understood?: boolean }
export function filterCollection<T extends CollectionEntry>(items: T[], filter: CollectionFilter): T[] {
  return items.filter(item => (!filter.session || item.sessionId === filter.session) && (!filter.node || item.nodeId === filter.node)
    && (filter.status === 'all' || Boolean(item.understood) === (filter.status === 'understood')))
}
