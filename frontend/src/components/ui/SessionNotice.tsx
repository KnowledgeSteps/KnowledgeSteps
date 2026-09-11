import { Button, Modal } from 'antd'
import { ExclamationCircleOutlined } from '@ant-design/icons'
import { useState } from 'react'
import type { ReactNode } from 'react'
import '../../design/session-notice.css'

export function SessionNotice({ title, body, onPrimary, primaryLabel, secondary, target }: {
  title: string
  body: string
  onPrimary: () => void
  primaryLabel: string
  secondary?: ReactNode
  target?: string
}) {
  const [open, setOpen] = useState(true)
  return <>
    {!open && <div className="session-notice-reopen"><Button onClick={() => setOpen(true)}>重新查看提示</Button></div>}
    <Modal open={open} centered width={420} className="session-notice-modal"
      onCancel={() => setOpen(false)}
      title={<span className="session-notice-title"><ExclamationCircleOutlined />{target ? '寻路失败' : title}</span>}
      footer={<div className="session-notice-actions">{secondary}<Button type="primary" onClick={onPrimary}>{primaryLabel}</Button></div>}>
      <p className="session-notice-reason">{body}</p>
    </Modal>
  </>
}
