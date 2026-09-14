import { BarChartOutlined, BookOutlined, HistoryOutlined, UserOutlined, ReadOutlined } from '@ant-design/icons'
import { Avatar, Button } from 'antd'
import { startTransition, useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { Outlet, useLocation, useMatch, useNavigate } from 'react-router-dom'
import { menuPageLoaders, type MenuPagePath } from './menuPages'
import '../../design/navigation.css'
import { isMockMode } from '../../api/config'
import { logout } from '../../api/auth'
import { useAuth } from '../../hooks/useAuth'
import { TutorialWelcome } from '../reading/TutorialWelcome'

export function AppShell() {
  const navigate = useNavigate()
  const location = useLocation()
  const contentRef = useRef<HTMLDivElement>(null)
  const fade = useRef<Animation | null>(null)
  const navigationSequence = useRef(0)
  const [pendingMenu, setPendingMenu] = useState<{ path: MenuPagePath; from: string } | null>(null)
  const [navigationError, setNavigationError] = useState<string | null>(null)
  const menuBusy = pendingMenu?.from === location.key
  useEffect(() => () => { navigationSequence.current += 1; fade.current?.cancel() }, [location.key])

  async function switchMenu(path: MenuPagePath) {
    if (path === location.pathname || menuBusy) return
    const sequence = ++navigationSequence.current
    setPendingMenu({ path, from: location.key }); setNavigationError(null)
    try {
      await menuPageLoaders[path]()
      if (sequence !== navigationSequence.current) return
      if (!window.matchMedia('(prefers-reduced-motion: reduce)').matches && contentRef.current?.animate) {
        fade.current = contentRef.current.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 140, easing: 'ease-out', fill: 'forwards' })
        await fade.current.finished
      }
      if (sequence !== navigationSequence.current) return
      startTransition(() => {
        navigate(path)
        setPendingMenu(null)
      })
    } catch {
      if (sequence !== navigationSequence.current) return
      fade.current?.cancel(); setPendingMenu(null); setNavigationError('页面暂时无法打开，请再次点击菜单重试。')
    }
  }
  function menuButton(path: MenuPagePath, label: string, icon: ReactNode) {
    const active = location.pathname === path
    return <Button className={`nav-history${active ? ' nav-menu-active' : ''}`} aria-label={label}
      aria-current={active ? 'page' : undefined} icon={icon} disabled={menuBusy}
      loading={menuBusy && pendingMenu.path === path} onClick={() => void switchMenu(path)}>
      <span className="nav-history-label">{label}</span></Button>
  }
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
      <header className={`site-header${isSessionPage ? ' has-session-nav' : ''}${questionMatch ? ' has-quiz-nav' : ''}`}>
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
            <div className="nav-menu">
            {auth.user?.role === 'ADMIN' && menuButton('/admin/analytics', '访问统计', <BarChartOutlined />)}
            {menuButton('/history', '历史寻路', <HistoryOutlined />)}
            {menuButton('/doubts', '疑惑本', <BookOutlined />)}
            {menuButton('/knowledge-cards', '知识卡片', <ReadOutlined />)}
            </div>
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
        {location.pathname === '/' && <TutorialWelcome key={auth.user?.userId} />}
        {logoutError && <p className="field-error" role="alert">{logoutError}</p>}
        {navigationError && <p className="field-error" role="alert">{navigationError}</p>}
        <div key={location.pathname} ref={contentRef} className={location.pathname in menuPageLoaders ? 'menu-page-transition' : undefined} data-page-path={location.pathname}>
          <Outlet context={{ headerSlot }} />
        </div>
      </main>

      <footer className="site-footer">
        <Button type="link" aria-label="新手教程" icon={<ReadOutlined />} onClick={() => navigate('/tutorial')}>新手教程</Button>
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
