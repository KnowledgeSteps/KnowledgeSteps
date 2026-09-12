import { HistoryOutlined, UserOutlined } from '@ant-design/icons'
import { Avatar, Button } from 'antd'
import { useState } from 'react'
import { Outlet, useMatch, useNavigate } from 'react-router-dom'
import { isMockMode } from '../../api/config'
import { logout } from '../../api/auth'
import { useAuth } from '../../hooks/useAuth'

export function AppShell() {
  const navigate = useNavigate()
  const auth = useAuth()
  const questionMatch = useMatch('/sessions/:sessionId/questions')
  const resultMatch = useMatch('/sessions/:sessionId/result')
  const isSessionPage = Boolean(questionMatch || resultMatch)
  const [headerSlot, setHeaderSlot] = useState<HTMLDivElement | null>(null)
  const [loggingOut, setLoggingOut] = useState(false)
  const [logoutError, setLogoutError] = useState<string | null>(null)

  async function handleLogout(): Promise<void> {
    if (loggingOut) return
    setLoggingOut(true)
    setLogoutError(null)
    try {
      await logout()
      navigate('/login', { replace: true })
    } catch {
      setLogoutError('退出未完成，请重新确认登录状态后重试。')
    } finally {
      setLoggingOut(false)
    }
  }

  return (
    <>
      <a className="skip-link" href="#main-content">
        跳到主要内容
      </a>
      <header className={`site-header${isSessionPage ? ' has-session-nav' : ''}`}>
        {isSessionPage && <div className="header-session-slot" ref={setHeaderSlot} />}
        <div className="nav">
          <Button
            htmlType="button"
            className="brand"
            onClick={() => navigate('/')}
          >
            <img className="brand-logo" src="/zhijie.png" alt="知阶 Knowledge Steps" />
          </Button>

          <div className="nav-actions">
            <Button icon={<HistoryOutlined />} onClick={() => navigate('/history')}>历史寻路</Button>
            <div className="auth-actions">
              <div className="nav-user">
                <Avatar src={auth.user?.avatarUrl} icon={<UserOutlined />} alt="用户头像" />
                <span className="nav-username" title={auth.user?.nickname}>{auth.user?.nickname || '用户'}</span>
              </div>
              <span className="auth-status" role="status">{auth.status === 'authenticated' ? '已登录' : '连接中…'}</span>
              <div className="logout-slot">
                {/* From Uiverse.io by vinodjangid07 */}
                <Button htmlType="button" className="nav-logout" onClick={() => void handleLogout()}
                  disabled={loggingOut} aria-label={loggingOut ? '正在退出登录' : '退出登录'} aria-busy={loggingOut}>
                  <span className="sign" aria-hidden="true"><svg viewBox="0 0 512 512" fill="currentColor"><path d="M377.9 105.9L500.7 228.7c7.2 7.2 11.3 17.1 11.3 27.3s-4.1 20.1-11.3 27.3L377.9 406.1c-6.4 6.4-15 9.9-24 9.9c-18.7 0-33.9-15.2-33.9-33.9l0-62.1-128 0c-17.7 0-32-14.3-32-32l0-64c0-17.7 14.3-32 32-32l128 0 0-62.1c0-18.7 15.2-33.9 33.9-33.9c9 0 17.6 3.6 24 9.9zM160 96L96 96c-17.7 0-32 14.3-32 32l0 256c0 17.7 14.3 32 32 32l64 0c17.7 0 32 14.3 32 32s-14.3 32-32 32l-64 0c-53 0-96-43-96-96L0 128C0 75 43 32 96 32l64 0c17.7 0 32 14.3 32 32s-14.3 32-32 32z" /></svg></span>
                  <span className="text">{loggingOut ? '退出中…' : '退出登录'}</span>
                </Button>
              </div>
            </div>
          </div>
        </div>
      </header>

      <main className={`page${isSessionPage ? ' session-page-content' : ''}`} id="main-content">
        {logoutError && <p className="field-error" role="alert">{logoutError}</p>}
        <Outlet context={{ headerSlot }} />
      </main>

      <footer className="site-footer">
        <div className="footer-slogan">
          <i aria-hidden="true" />
          <span>每一个知识，都有它的台阶</span>
          <i aria-hidden="true" />
        </div>
        {isMockMode && (
          <p className="footer-note">
            Mock 学习数据 · 登录使用真实后端，学习流程不调用知乎与大模型
          </p>
        )}
      </footer>
    </>
  )
}
