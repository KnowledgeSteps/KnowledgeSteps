import { Alert, Button } from 'antd'
import { useLocation, useNavigate } from 'react-router-dom'
import { isRetryableReadError, type ReadRecovery } from '../../api/recoverableRead'
import { loginUrl } from '../../api/loginNavigation'
import { SessionNotice } from './SessionNotice'

export function SessionReadNotice({ error, retrying, retryDelayMs, reload, label }: ReadRecovery & {
  reload: () => void
  label: string
}) {
  const navigate = useNavigate()
  const location = useLocation()
  if (!error) return null
  if (error.status === 401) return <SessionNotice title="登录已失效" body="请重新登录后继续查看这条寻路。"
    primaryLabel="重新登录" onPrimary={() => navigate(loginUrl(location.pathname))} />
  if ([403, 404, 410].includes(error.status) && error.code !== 'CSRF_INVALID') return <SessionNotice title="无法访问这条寻路"
    body="这条记录可能已被删除，或不属于当前账号。" primaryLabel="查看历史寻路" onPrimary={() => navigate('/history')} />
  const recoverable = isRetryableReadError(error)
  const message = retrying
    ? `${label}暂时中断，${Math.ceil((retryDelayMs ?? 2000) / 1000)} 秒后自动重试。当前寻路已保留。`
    : recoverable ? `${label}暂时中断，自动重试未成功。请重试读取当前寻路，无需重新创建。` : error.message
  return <Alert type="warning" showIcon title={message}
    action={<Button size="small" disabled={retrying} loading={retrying} onClick={reload}>{retrying ? '正在恢复' : '重试读取'}</Button>} />
}
