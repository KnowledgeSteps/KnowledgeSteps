import { LoadingScreen } from '../components/ui/LoadingScreen'
import { InteractiveKnowledgeCard } from '../components/ui/InteractiveKnowledgeCard'
import { Button } from 'antd'
import { useEffect, useRef, useState } from 'react'
import { Navigate, useSearchParams } from 'react-router-dom'
import { ApartmentOutlined, FormOutlined, BranchesOutlined, LockOutlined, GithubOutlined, StarFilled } from '@ant-design/icons'
import { refreshCurrentUser } from '../api/auth'
import { safeReturnTo } from '../api/loginNavigation'
import { oauthErrorMessage, zhihuLoginUrl } from '../api/oauthNavigation'
import { useAuth } from '../hooks/useAuth'
import { AdminLoginDialog } from '../components/auth/AdminLoginDialog'
import { ConnectionButton } from '../components/auth/ConnectionButton'
import '../components/auth/login.css'

export function LoginPage() {
  const auth = useAuth()
  const [searchParams] = useSearchParams()
  const [adminOpen, setAdminOpen] = useState(false)
  const [oauthPending, setOauthPending] = useState(false)
  const [navigationError, setNavigationError] = useState<string | null>(null)
  const oauthStarting = useRef(false)
  const oauthError = navigationError ?? oauthErrorMessage(searchParams.get('oauthError'))
  const checking = auth.status === 'loading' || auth.status === 'unknown'

  useEffect(() => {
    // The browser can restore this page from its back/forward cache after cancellation.
    const resetNavigation = (event: PageTransitionEvent) => {
      oauthStarting.current = false
      setOauthPending(false)
      if (event.persisted) void refreshCurrentUser().catch(() => undefined)
    }
    window.addEventListener('pageshow', resetNavigation)
    return () => window.removeEventListener('pageshow', resetNavigation)
  }, [])

  function startOAuth() {
    if (checking || oauthStarting.current) return
    oauthStarting.current = true
    setOauthPending(true)
    setNavigationError(null)
    try {
      window.location.assign(zhihuLoginUrl(searchParams.get('returnTo')))
    } catch {
      oauthStarting.current = false
      setOauthPending(false)
      setNavigationError(oauthErrorMessage('OAUTH_FAILED'))
    }
  }

  if (auth.status === 'authenticated') return <><LoadingScreen label="正在进入主页…" /><Navigate to={safeReturnTo(searchParams.get('returnTo'))} replace /></>

  return (
    <>
      {(checking || oauthPending) && <LoadingScreen label={oauthPending ? '正在前往知乎授权…' : adminOpen ? '正在验证登录…' : '正在确认登录状态…'} />}
    <div className="login-gateway" hidden={checking}>
      <a className="skip-link" href="#login-main">跳到登录入口</a>
      <header className="gateway-header">
        <div className="gateway-brand"><img src="/zhijie.png" alt="知阶 KnowledgeSteps" /></div>
        {/* From Uiverse.io by elijahgummer; Ant Design controls and project tokens. */}
        <Button className="gateway-github" href="https://github.com/KnowledgeSteps/KnowledgeSteps"
          target="_blank" rel="noopener noreferrer" aria-label="在 GitHub 查看 KnowledgeSteps 仓库（新窗口）">
          <span className="github-shine" aria-hidden="true" />
          <GithubOutlined /><span>Star on GitHub</span><StarFilled className="github-star" />
        </Button>
      </header>
      <main className="gateway-main" id="login-main">
        <p className="gateway-eyebrow">每一个知识，都有它的台阶。</p>
        <h1>告诉我你想学什么，<br /><span>帮你找到还缺的基础。</span></h1>
        <p className="gateway-description">找到学习目标需要的前置知识。<br />通过简单自评，帮你补齐基础，并推荐知乎学习资料。</p>
        <div className="gateway-features">
          <InteractiveKnowledgeCard className="ks-card-interactive" icon={<ApartmentOutlined />}> <h2>知道先学什么</h2><p>找到目标需要的前置知识，理清哪些要先学、哪些可以一起学。</p></InteractiveKnowledgeCard>
          <InteractiveKnowledgeCard className="ks-card-interactive" icon={<FormOutlined />}> <h2>看看自己会多少</h2><p>回答几个简单问题，确认哪些已经会了，哪些还需要补。</p></InteractiveKnowledgeCard>
          <InteractiveKnowledgeCard className="ks-card-interactive" icon={<BranchesOutlined />}> <h2>只补齐需要的</h2><p>跳过已经会的，附上知乎学习资料，帮你补齐缺少的基础。</p></InteractiveKnowledgeCard>
        </div>
        <div className="gateway-connection glitch-form-wrapper">
          <ConnectionButton label={oauthPending ? '正在前往知乎授权…' : '使用知乎授权登录'} loading={oauthPending} disabled={checking || oauthPending} onClick={startOAuth} aria-describedby="oauth-status" aria-busy={oauthPending} />
        </div>
        <div className="gateway-status" id="oauth-status" aria-live="polite">
          {checking ? <p>正在确认登录状态…</p> : oauthPending ? <p>正在前往知乎，请完成授权后返回。</p> : oauthError ? <p role="alert">{oauthError}</p> : <p>仅在你授权后获取必要信息，用于登录和学习服务。</p>}
          {auth.status === 'error' && <p role="alert">{auth.error} <Button htmlType="button" onClick={() => void refreshCurrentUser().catch(() => undefined)}>重新连接</Button></p>}
        </div>
      </main>
      <div className="gateway-admin-row">
        <Button htmlType="button" className="gateway-admin" onClick={() => setAdminOpen(true)} disabled={checking || oauthPending}
          aria-haspopup="dialog" aria-expanded={adminOpen}><LockOutlined />管理员登录</Button>
      </div>
      <footer className="gateway-bottom">
        <p>本站使用第一方匿名 Cookie 统计访问量，并统计 IP 归属地、系统及浏览器类别；统计不保存学习目标或明文 IP。Cookie 保留一年，统计保留 30 天。开启浏览器 DNT / GPC 可停止统计。</p>
        <div className="gateway-footer-brand">
          <div className="gateway-footer-name"><img src="/icon.png" alt="" /><span>KnowledgeSteps</span></div>
          <p>© 2026 知阶 KnowledgeSteps</p>
        </div>
      </footer>
      <AdminLoginDialog open={adminOpen} onClose={() => setAdminOpen(false)} />
    </div>
    </>
  )
}
