import { useNavigate } from 'react-router-dom'
import { SessionNotice } from './SessionNotice'

export function EmptyGraphNotice({ target }: { target: string }) {
  const navigate = useNavigate()
  return <SessionNotice
    title="暂未找到前置知识"
    body={`暂时没有找到「${target}」的相关节点。可能是主题较小众、名称不够明确或存在错别字。请检查名称，补充所属领域或想了解的具体方面后再试。`}
    primaryLabel="修改目标后重试"
    onPrimary={() => navigate('/', { state: { draftTarget: target } })}
  />
}
