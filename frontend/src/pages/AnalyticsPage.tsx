import { useCallback, useMemo, useState, type ReactNode } from 'react'
import { AndroidOutlined, AppleOutlined, ChromeOutlined, DesktopOutlined, DownloadOutlined, GlobalOutlined, QuestionCircleOutlined, ReloadOutlined, ShareAltOutlined, WindowsOutlined } from '@ant-design/icons'
import { Alert, App, Button, Card, DatePicker, Empty, Modal, Progress, Result, Segmented, Skeleton, Space, Table, Tabs, Tooltip } from 'antd'
import dayjs from 'dayjs'
import { getAnalytics, getAnalyticsVisits, type AnalyticsBucket, type AnalyticsRange } from '../api/analytics'
import { useAuth } from '../hooks/useAuth'
import { useRecoverableRead } from '../hooks/useRecoverableRead'
import { AnalyticsChart } from '../components/analytics/AnalyticsChart'
import { AnalyticsMap } from '../components/analytics/AnalyticsMap'
import { barOptions, lineOptions } from '../components/analytics/chartOptions'
import { dailyCsv, downloadCsv, weekdayValues } from '../components/analytics/dashboardData'
import '../design/analytics.css'

function Help({ text }: { text: string }) {
  return <Tooltip title={text}><span className="analytics-help" tabIndex={0} aria-label={text}><QuestionCircleOutlined /></span></Tooltip>
}
function Panel({ title, help, controls, children, wide = false }: { title: string; help: string; controls?: ReactNode; children: ReactNode; wide?: boolean }) {
  return <Card className={`analytics-panel${wide ? ' analytics-wide' : ''}`}>
    <div className="analytics-panel-head"><h2>{title}<Help text={help} /></h2>{controls}</div>{children}
  </Card>
}
function Rank({ values, total, ip = false }: { values: AnalyticsBucket[]; total: number; ip?: boolean }) {
  if (!values.length) return <div className="analytics-rank-empty"><Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="所选日期暂无数据" /></div>
  return <table className="analytics-rank"><thead><tr><th>{ip ? '匿名 IP 标识（按日）' : '地区'}</th>{!ip && <th>占比</th>}<th>访问次数</th></tr></thead>
    <tbody>{values.slice(0, 10).map((v, i) => <tr key={v.name}><td className={ip ? 'analytics-ip' : ''}>{ip ? v.name : `${i + 1}. ${v.name}`}</td>
      {!ip && <td>{total ? (v.value / total * 100).toFixed(1) : 0}%</td>}<td>{v.value.toLocaleString()} 次</td></tr>)}</tbody></table>
}
function DeviceRows({ values, total, browser = false }: { values: AnalyticsBucket[]; total: number; browser?: boolean }) {
  if (!values.length) return <div className="analytics-rank-empty"><Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无访问数据" /></div>
  return <div>{values.map(v => <div className="analytics-device" key={v.name}>
    <div className="analytics-device-line"><span className="analytics-device-name"><span className="analytics-device-icon">
      {browser ? v.name === 'Chrome' ? <ChromeOutlined /> : <GlobalOutlined /> : v.name === 'Windows' ? <WindowsOutlined /> : ['macOS', 'iOS'].includes(v.name) ? <AppleOutlined /> : v.name === 'Android' ? <AndroidOutlined /> : <DesktopOutlined />}
    </span>{v.name}：{total ? (v.value / total * 100).toFixed(1) : 0}%</span><span>{v.value.toLocaleString()} 次</span></div>
    <Progress percent={total ? v.value / total * 100 : 0} showInfo={false} size="small" />
  </div>)}</div>
}
const pageNames: Record<string, string> = { home: '首页', login: '登录页', history: '历史寻路', questions: '自评问卷', result: '结果图谱', unknown: '未知页面' }
const todayString = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date())

export function AnalyticsPage() {
  const auth = useAuth()
  const { message } = App.useApp()
  const allowed = auth.user?.role === 'ADMIN'
  const today = dayjs(todayString())
  const [range, setRange] = useState<AnalyticsRange>(() => [today.subtract(6, 'day').format('YYYY-MM-DD'), today.format('YYYY-MM-DD')])
  const [tab, setTab] = useState('charts')
  const [view, setView] = useState('curve')
  const [mapKind, setMapKind] = useState<'china' | 'world'>('china')
  const [page, setPage] = useState(1)
  const [sharing, setSharing] = useState(false)
  const [copying, setCopying] = useState(false)
  const read = useCallback((signal: AbortSignal) => getAnalytics(signal, range), [range])
  const readVisits = useCallback((signal: AbortSignal) => getAnalyticsVisits(signal, range, page), [range, page])
  const key = `${auth.user?.userId}:${range.join(':')}`
  const summary = useRecoverableRead(allowed ? key : '', read)
  const visits = useRecoverableRead(allowed && tab === 'records' ? `${key}:${page}` : '', readVisits)
  const data = summary.data
  const totals = useMemo(() => data?.days.reduce((s, d) => ({ pv: s.pv + d.pv, uv: s.uv + d.uv, ip: s.ip + d.ip }), { pv: 0, uv: 0, ip: 0 }) ?? { pv: 0, uv: 0, ip: 0 }, [data])
  const curve = useMemo(() => lineOptions(data?.days ?? []), [data])
  const hourly = useMemo(() => barOptions(Array.from({ length: 24 }, (_, i) => `${i}`), Array.from({ length: 24 }, (_, i) => data?.hours.find(h => h.name === `${i}`)?.value ?? 0)), [data])
  const weekly = useMemo(() => barOptions(['周一', '周二', '周三', '周四', '周五', '周六', '周日'], weekdayValues(data?.days ?? [])), [data])
  const shareText = `知阶访问统计\n${range[0]} 至 ${range[1]}（北京时间）\n访问次数 PV：${totals.pv}\n日访客数 UV 合计：${totals.uv}\n日独立 IP 数合计：${totals.ip}\n说明：跨天 UV / IP 未做整段日期去重，管理员访问不计入。`
  async function copySummary() {
    setCopying(true)
    try { await navigator.clipboard.writeText(shareText); void message.success('统计摘要已复制') }
    catch { void message.error('复制失败，请手动选择上方摘要复制。') }
    finally { setCopying(false) }
  }
  if (!allowed) return <Result status="403" title="仅管理员可查看访问统计" />
  return <section className="analytics-dashboard" aria-label="访问统计">
    <div className="analytics-toolbar">
      <Tabs activeKey={tab} onChange={setTab} items={[{ key: 'charts', label: '数据图表' }, { key: 'records', label: '访问记录' }]} />
      <div className="analytics-toolbar-actions">
        <DatePicker.RangePicker value={[dayjs(range[0]), dayjs(range[1])]} allowClear={false}
          aria-label="统计日期范围" format="YYYY-MM-DD" maxDate={today} minDate={today.subtract(29, 'day')}
          presets={[{ label: '今天', value: [today, today] }, { label: '近 7 天', value: [today.subtract(6, 'day'), today] }, { label: '近 30 天', value: [today.subtract(29, 'day'), today] }]}
          onChange={dates => { if (dates?.[0] && dates[1]) { setRange([dates[0].format('YYYY-MM-DD'), dates[1].format('YYYY-MM-DD')]); setPage(1) } }} />
        <Button icon={<ShareAltOutlined />} disabled={!data} onClick={() => setSharing(true)}>分享数据</Button>
        <Button icon={<ReloadOutlined />} disabled={summary.retrying || (!data && !summary.error)} onClick={() => { summary.reload(); if (tab === 'records') visits.reload() }}>刷新数据</Button>
      </div>
    </div>
    {summary.error && <Alert className="analytics-alert" type="warning" showIcon title="数据暂时无法加载" description={summary.error.message} action={<Button disabled={summary.retrying} onClick={summary.reload}>重试</Button>} />}
    {!data && !summary.error && <Skeleton active aria-label="统计加载中" />}
    {tab === 'charts' && data && <div className="analytics-panels">
      <Panel wide title="数据曲线" help="曲线按天展示；上方数字为所选日期各日数值之和。UV 和 IP 不可当作整个日期区间的去重人数。"
        controls={<Space wrap><Segmented aria-label="数据展示方式" value={view} onChange={setView} options={[{ value: 'curve', label: '曲线视图' }, { value: 'table', label: '列表视图' }]} />
          <Button icon={<DownloadOutlined />} onClick={() => downloadCsv(`访问统计-${range[0]}-${range[1]}.csv`, dailyCsv(data.days))}>导出数据</Button></Space>}>
        <div className="analytics-summary"><span className="analytics-metric"><i />访问次数：{totals.pv.toLocaleString()}</span>
          <span className="analytics-metric"><i />{data.days.length === 1 ? '访问人数' : '日访客数合计'}：{totals.uv.toLocaleString()}</span>
          <span className="analytics-metric"><i />{data.days.length === 1 ? 'IP 数' : '日 IP 数合计'}：{totals.ip.toLocaleString()}</span></div>
        {view === 'curve' ? <AnalyticsChart option={curve} className="analytics-line-chart" label="每日 PV、UV 与 IP 数变化，可切换列表查看数值" /> :
          <Table size="small" rowKey="day" dataSource={data.days} pagination={{ pageSize: 10, showSizeChanger: false }} scroll={{ x: 450 }}
            columns={[{ title: '日期', dataIndex: 'day' }, { title: '访问次数 PV', dataIndex: 'pv' }, { title: '访问人数 UV', dataIndex: 'uv' }, { title: 'IP 数', dataIndex: 'ip' }]} />}
        {!totals.pv && <p className="analytics-footnote">所选日期尚无访问数据，统计从功能启用后开始。</p>}
      </Panel>
      <Panel wide title="地区分布" help="根据离线 IP 数据库推测省份和国家，不是用户 GPS 位置；代理、内网和数据库更新延迟会影响准确性。"
        controls={<Segmented aria-label="地图范围" value={mapKind} onChange={v => setMapKind(v as 'china' | 'world')} options={[{ value: 'china', label: '中国地图' }, { value: 'world', label: '世界地图' }]} />}>
        <div className="analytics-regions"><div><p className="analytics-footnote">Top 10 {mapKind === 'china' ? '省级地区' : '国家 / 地区'}</p>
          <Rank values={mapKind === 'china' ? data.regions : data.countries} total={totals.pv} />
          <p className="analytics-footnote">占比以所选日期全部访问次数为分母；未知、内网地址不在地图着色。</p></div>
          <AnalyticsMap kind={mapKind} values={mapKind === 'china' ? data.regions : data.countries} /></div>
      </Panel>
      <Panel wide title="24 小时分布" help="所选日期内的访问次数按北京时间 0—23 时合并。"><AnalyticsChart option={hourly} label="24 小时访问次数分布，时间为北京时间" /></Panel>
      <Panel title="高频 IP" help="按日去重摘要显示 Top 10 来源。为了不保留明文 IP，同一地址跨日使用不同匿名标识。"><Rank values={data.ips} total={totals.pv} ip /></Panel>
      <Panel title="一周分布" help="所选日期内的访问次数按周一至周日合并，不表示最近一周独立用户。"><AnalyticsChart option={weekly} label="周一至周日访问次数分布" /></Panel>
      <Panel title="操作系统" help="按浏览器请求中的 User-Agent 分类，不保存完整请求头；无法识别时记为未知。"><DeviceRows values={data.systems} total={totals.pv} /></Panel>
      <Panel title="访问浏览器" help="按浏览器类别统计访问次数，内嵌浏览器或隐私模式可能影响识别。"><DeviceRows values={data.browsers} total={totals.pv} browser /></Panel>
    </div>}
    {tab === 'records' && <Card className="analytics-panel">
      <div className="analytics-panel-head"><h2>访问记录<Help text="最多保留最近 5000 条匿名记录，日期范围为最近 30 天。聚合统计不受记录数量上限影响。" /></h2></div>
      {visits.error && <Alert type="warning" title={visits.error.message} action={<Button disabled={visits.retrying} onClick={visits.reload}>重试</Button>} />}
      <Table rowKey="id" size="small" loading={!visits.data && !visits.error} dataSource={visits.data?.items ?? []} scroll={{ x: 1000 }}
        pagination={{ current: page, total: visits.data?.total ?? 0, pageSize: 20, showSizeChanger: false, onChange: setPage }}
        columns={[{ title: '访问时间（北京时间）', dataIndex: 'time', render: value => new Intl.DateTimeFormat('zh-CN', { timeZone: 'Asia/Shanghai', dateStyle: 'short', timeStyle: 'medium', hour12: false }).format(new Date(value)) },
          { title: '页面', dataIndex: 'page', render: value => pageNames[value] ?? '未知页面' }, { title: '匿名 IP', dataIndex: 'ip', className: 'analytics-ip' },
          { title: '国家 / 地区', dataIndex: 'country' }, { title: '省级地区', dataIndex: 'region' }, { title: '操作系统', dataIndex: 'os' }, { title: '浏览器', dataIndex: 'browser' }]} />
    </Card>}
    <p className="analytics-footnote">仅管理员可见 · 北京时间 · 保留近 30 天 · 排除管理员访问 · 尊重 DNT / GPC。统计库不保存明文 IP、学习目标及完整访问 URL。</p>
    <Modal open={sharing} title="分享统计摘要" onCancel={() => setSharing(false)} footer={<Button type="primary" loading={copying} onClick={() => void copySummary()}>复制摘要</Button>}>
      <p>只复制汇总数字，不生成公开链接，也不包含访问记录。</p><div className="analytics-share">{shareText}</div>
    </Modal>
  </section>
}
