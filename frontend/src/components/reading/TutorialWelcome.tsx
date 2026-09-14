import { useEffect, useState } from 'react'
import { Alert, Button, Modal, Space } from 'antd'
import { useNavigate } from 'react-router-dom'
import { changeTutorial, getTutorial } from '../../api/tutorial'

export function TutorialWelcome() {
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const [error, setError] = useState(false)
  useEffect(() => {
    const abort = new AbortController()
    // Let the initial loading mask finish before presenting the invitation.
    const timer = window.setTimeout(() => {
      void getTutorial(abort.signal).then(async progress => {
        if (abort.signal.aborted || progress.prompted) return
        await changeTutorial('seen', progress.revision)
        if (!abort.signal.aborted) setOpen(true)
      }).catch(() => { if (!abort.signal.aborted) setError(true) })
    }, 2200)
    return () => { abort.abort(); clearTimeout(timer) }
  }, [])
  return <>
    {error && <Alert type="info" showIcon title="新手教程暂时无法读取，你仍可正常寻路，也可稍后从页底进入教程。" closable />}
    <Modal title="欢迎来到知阶" open={open} onCancel={() => setOpen(false)} footer={<Space wrap>
      <Button onClick={() => setOpen(false)}>以后再说</Button><Button type="primary" onClick={() => { setOpen(false); navigate('/tutorial') }}>开始体验</Button>
    </Space>}><p>花几分钟，体验如何找基础、解释疑惑、收藏知识。</p><p>教程使用统一示例，不会占用你的个人记录。你可以随时退出，之后从页底的“新手教程”继续。</p></Modal>
  </>
}
