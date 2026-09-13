import { Button, Segmented, Select } from 'antd'

import { emptyCollectionFilter, type CollectionFilter, type CollectionEntry } from './collectionFilter'
export function CollectionFilters({ items, value, onChange, disabled, count }: {
  items: CollectionEntry[]; value: CollectionFilter; onChange: (value: CollectionFilter) => void; disabled: boolean; count: number
}) {
  const sessions = [...new Map(items.map(item => [item.sessionId, { value: item.sessionId, label: `${item.sessionTarget || '寻路'} · ${item.sessionId.slice(-6)}` }])).values()]
  const nodes = [...new Map(items.filter(item => !value.session || item.sessionId === value.session).map(item => [item.nodeId,
    { value: item.nodeId, label: `${item.nodeName}${value.session ? '' : ` · ${item.sessionTarget || '寻路'} ${item.sessionId.slice(-6)}`}` }])).values()]
  return <div className="collection-filters" aria-label="分类筛选">
    <Segmented<CollectionFilter['status']> aria-label="理解状态" disabled={disabled} value={value.status} options={[{ label: '全部', value: 'all' }, { label: '待理解', value: 'pending' }, { label: '已理解', value: 'understood' }]} onChange={status => onChange({ ...value, status })} />
    <Select aria-label="所属寻路" placeholder="全部寻路" allowClear showSearch optionFilterProp="label" disabled={disabled} value={value.session} options={sessions} onChange={session => onChange({ ...value, session, node: undefined })} />
    <Select aria-label="所属知识点" placeholder="全部知识点" allowClear showSearch optionFilterProp="label" disabled={disabled} value={value.node} options={nodes} onChange={node => onChange({ ...value, node })} />
    <Button disabled={disabled || (value.status === 'all' && !value.session && !value.node)} onClick={() => onChange(emptyCollectionFilter)}>重置筛选</Button>
    <span className="muted" role="status">符合条件 {count} 条</span>
  </div>
}
