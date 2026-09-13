import { ZhihuOutlined } from '@ant-design/icons'
import { ConnectionButton } from '../auth/ConnectionButton'
import '../auth/login.css'

export function OriginalArticleButton({ url }: { url?: string }) {
  if (!url || !/^https:\/\/(?:www\.|zhuanlan\.)?zhihu\.com\//i.test(url)) return null
  return <div className="glitch-form-wrapper reading-original-action">
    <ConnectionButton label="在知乎阅读原文" icon={<ZhihuOutlined />} href={url} target="_blank" rel="noopener noreferrer" />
  </div>
}
