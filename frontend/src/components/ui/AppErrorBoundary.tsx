import { Component, useEffect, useRef, type ReactNode } from 'react'
import { Button, Result } from 'antd'
import { HomeOutlined, ReloadOutlined } from '@ant-design/icons'
import '../../design/page-recovery.css'

type Failure = 'render' | 'chunk' | null

export class AppErrorBoundary extends Component<{ children: ReactNode }, { failure: Failure }> {
  state: { failure: Failure } = { failure: null }

  static getDerivedStateFromError(error: unknown): { failure: Failure } {
    const message = error instanceof Error ? error.message : ''
    return { failure: /Loading chunk|dynamically imported module|Importing a module script|Failed to load module/i.test(message) ? 'chunk' : 'render' }
  }

  render() {
    return this.state.failure ? <PageRecovery failure={this.state.failure} /> : this.props.children
  }
}

function PageRecovery({ failure }: { failure: Exclude<Failure, null> }) {
  const region = useRef<HTMLElement>(null)
  useEffect(() => { region.current?.focus() }, [])
  return <section ref={region} className="page-recovery" role="alert" tabIndex={-1} aria-label="页面恢复">
    <Result status="warning" title={failure === 'chunk' ? '页面资源加载失败' : '页面暂时无法显示'}
      subTitle="请刷新页面后重试。已保存的寻路记录不会受影响，也可以返回首页从历史寻路重新进入。"
      extra={[
        <Button key="reload" type="primary" icon={<ReloadOutlined />} onClick={() => window.location.reload()}>刷新当前页面</Button>,
        <Button key="home" href="/" icon={<HomeOutlined />}>返回首页</Button>,
      ]} />
  </section>
}
