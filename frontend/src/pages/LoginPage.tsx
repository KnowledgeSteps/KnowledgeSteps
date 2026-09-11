import { LoadingScreen } from '../components/ui/LoadingScreen'
import { KnowledgeCard } from '../components/ui/KnowledgeCard'
import { Button } from 'antd'
import { useState } from 'react'
import { Navigate, useSearchParams } from 'react-router-dom'
import { ApartmentOutlined, FormOutlined, BranchesOutlined, LockOutlined, GithubOutlined, StarFilled } from '@ant-design/icons'
import { refreshCurrentUser } from '../api/auth'
import { safeReturnTo } from '../api/loginNavigation'
import { useAuth } from '../hooks/useAuth'
import { AdminLoginDialog } from '../components/auth/AdminLoginDialog'
import { ConnectionButton } from '../components/auth/ConnectionButton'
import '../components/auth/login.css'

export function LoginPage() {
  const auth = useAuth()
  const [searchParams] = useSearchParams()
  const [adminOpen, setAdminOpen] = useState(false)
  const [oauthNotice, setOauthNotice] = useState(false)
  if (auth.status === 'authenticated') return <><LoadingScreen label="正在进入主页…" /><Navigate to={safeReturnTo(searchParams.get('returnTo'))} replace /></>
  const checking = auth.status === 'loading' || auth.status === 'unknown'

  return (
    <>
      {checking && <LoadingScreen label={adminOpen ? '正在验证登录…' : '正在确认登录状态…'} />}
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
          <KnowledgeCard className="ks-card-interactive" icon={<ApartmentOutlined />}> <h2>知道先学什么</h2><p>找到目标需要的前置知识，理清哪些要先学、哪些可以一起学。</p></KnowledgeCard>
          <KnowledgeCard className="ks-card-interactive" icon={<FormOutlined />}> <h2>看看自己会多少</h2><p>回答几个简单问题，确认哪些已经会了，哪些还需要补。</p></KnowledgeCard>
          <KnowledgeCard className="ks-card-interactive" icon={<BranchesOutlined />}> <h2>只补齐需要的</h2><p>跳过已经会的，附上知乎学习资料，帮你补齐缺少的基础。</p></KnowledgeCard>
        </div>
        <div className="gateway-connection glitch-form-wrapper">
          <ConnectionButton label="使用知乎授权登录" disabled={checking} onClick={() => setOauthNotice(true)} aria-describedby="oauth-status" />
        </div>
        <div className="gateway-status" id="oauth-status" aria-live="polite">
          {checking ? <p>正在确认登录状态…</p> : oauthNotice ? <p>知乎授权正在申请中，暂未开放。团队成员可使用左下角的管理员入口。</p> : <p>仅在你授权后获取必要信息，用于登录和学习服务。</p>}
          {auth.status === 'error' && <p role="alert">{auth.error} <Button htmlType="button" onClick={() => void refreshCurrentUser().catch(() => undefined)}>重新连接</Button></p>}
        </div>
      </main>
      <div className="gateway-admin-row">
        <Button htmlType="button" className="gateway-admin" onClick={() => setAdminOpen(true)} disabled={checking}
          aria-haspopup="dialog" aria-expanded={adminOpen}><LockOutlined />管理员登录</Button>
      </div>
      <footer className="gateway-bottom">
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
