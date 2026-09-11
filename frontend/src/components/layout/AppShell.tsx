import { Outlet, useNavigate } from 'react-router-dom'
import { isMockMode } from '../../api/config'

export function AppShell() {
  const navigate = useNavigate()
  return (
    <>
      <a className="skip-link" href="#main-content">
        跳到主要内容
      </a>
      <header>
        <div className="nav">
          <button
            type="button"
            className="brand"
            onClick={() => navigate('/')}
          >
            <img className="brand-logo" src="/zhijie.png" alt="知阶 Knowledge Steps" />
          </button>

          <div className="nav-actions">
            <span className="navnote">每一个知识，都有它的台阶</span>
            <button
              type="button"
              className="primary small"
              onClick={() => navigate('/')}
            >
              开始寻路 →
            </button>
          </div>
        </div>
      </header>

      <main className="page" id="main-content">
        <Outlet />
      </main>

      <footer>
        <div className="footer-slogan">
          <i aria-hidden="true" />
          <span>每一个知识，都有它的台阶</span>
          <i aria-hidden="true" />
        </div>
        {isMockMode && (
          <p className="footer-note">
            Mock 前端演示 · 未接入后端、知乎 API 与大模型
          </p>
        )}
      </footer>
    </>
  )
}
