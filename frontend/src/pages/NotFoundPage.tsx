import { useNavigate } from 'react-router-dom'

export function NotFoundPage() {
  const navigate = useNavigate()
  return (
    <section className="fail-panel enter">
      <span className="badge">404</span>
      <h1>这条寻路记录不存在</h1>
      <p>任务可能已过期，或当前账号无权查看它。</p>
      <div className="actions">
        <button className="primary" onClick={() => navigate('/')}>
          回到首页重新寻路 →
        </button>
      </div>
    </section>
  )
}
