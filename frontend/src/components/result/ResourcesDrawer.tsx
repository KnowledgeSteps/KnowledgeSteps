import '../../design/resource-reading.css';
import { InfoCircleOutlined } from '@ant-design/icons';
import { CardDecoration } from '../ui/CardDecoration';
import '../../design/waiting.css';
import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { ReloadOutlined } from '@ant-design/icons';
import { Drawer, Spin, Button, Tag } from 'antd';
import type { KnowledgeNode, NodeResources } from '../../api/types';
import { getNodeResources } from '../../api/sessions';
import { isMockMode } from '../../api/config';
import { ResourceSummary } from './ResourceSummary';
interface ResourcesDrawerProps {
    sessionId: string;
    node: KnowledgeNode | null;
    onClose: () => void;
}
export function ResourcesDrawer({ sessionId, node, onClose, }: ResourcesDrawerProps) {
    return (<Drawer title={node ? node.name : ''} placement="right" open={Boolean(node)} onClose={onClose} size="min(680px, 94vw)" className="path-drawer" styles={{ body: { padding: 0 } }}>
      {node && (<NodeResourcesPanel key={node.id} sessionId={sessionId} node={node}/>)}
    </Drawer>);
}
function NodeResourcesPanel({ sessionId, node, }: {
    sessionId: string;
    node: KnowledgeNode;
}) {
    const [data, setData] = useState<NodeResources | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [retryKey, setRetryKey] = useState(0);
    useEffect(() => {
        let cancelled = false;
        getNodeResources(sessionId, node.id)
            .then((payload) => {
            if (!cancelled)
                setData(payload);
        })
            .catch(() => {
            if (!cancelled)
                setError('资料加载失败，请稍后重试。');
        })
            .finally(() => {
            if (!cancelled)
                setLoading(false);
        });
        return () => {
            cancelled = true;
        };
    }, [sessionId, node.id, retryKey]);
    function retry(): void {
        setData(null);
        setError(null);
        setLoading(true);
        setRetryKey((key) => key + 1);
    }
    return (<div className="drawer-body">
      {loading ? (<div className="resource-loading">
          <Spin />
          <span>正在整理这个节点的资料…</span>
        </div>) : error ? (<StateBlock title="资料加载失败" body="暂时无法获取这个节点的学习资料，请稍后重新打开。" action={<Button htmlType="button" className="outline small" onClick={retry}>
              <ReloadOutlined /> 再试一次
            </Button>}/>) : data?.resourceStatus === 'NOT_APPLICABLE' && node.isTarget ? (<p className="target-node-description">{data.reason}</p>) : data?.resourceStatus === 'NOT_APPLICABLE' ? (<section className="resource-not-recommended">

          <Tag>非常了解 · 已掌握</Tag>
          <p className="resource-node-description">{data.reason}</p>
          <p className="muted">
            你已选择非常了解，节点仍保留在图谱中，不再推荐资料。
          </p>
        </section>) : data?.resourceStatus === 'EMPTY' ? (<StateBlock title="暂时没有合适资料" body={isMockMode
                ? '这个节点还没有找到匹配的知乎内容。接入真实接口后，会在这里展示检索结果。'
                : '这个节点暂时没有找到匹配的知乎内容。'}/>) : data?.resourceStatus === 'FAILED' ? (<StateBlock title="资料搜索失败" body="本次资料搜索失败，暂不支持重新搜索。你可以继续查看其他节点的资料。"/>) : data ? (<>
          <div className="drawer-intro">
            <p className="resource-node-description">{data.reason}</p>
            {isMockMode && (<span className="muted">
                以下为本地 Mock 资料；链接为知乎站内检索，不代表具体文章。
              </span>)}
          </div>
          <div className="resource-list">
            {data.resources.map((item, index) => (<article className="resource-item resource-blob-card waiting-blob-card" key={item.id}>
              <div className="waiting-blob-bg" aria-hidden="true" />
              <div className="waiting-blob" aria-hidden="true" />
              <div className="waiting-content">

                <div className="between">
                  <span className="resource-index">资料 {index + 1}</span>
                  {isMockMode && <span className="badge demo">演示数据</span>}
                </div>
                <h4>{item.title.replace(/\s*-\s*知乎\s*$/, '')}</h4>
                {item.summary && <ResourceSummary text={item.summary}/>}
                <Button className="resource-original-link" href={item.url} target="_blank" rel="noopener noreferrer"
                  aria-label={isMockMode ? '去知乎检索相关讨论' : '在知乎阅读原文'}
                  data-text={isMockMode ? '去知乎检索相关讨论' : '在知乎阅读原文'}>
                  <span className="resource-link-text">{isMockMode ? '去知乎检索相关讨论' : '在知乎阅读原文'}</span>
                </Button>
                <div className="resource-footer">
                {(item.authorName || item.voteCount !== null) && (<small className="resource-meta">
                    {item.authorName
                        ? `作者：${item.authorName}`
                        : '作者暂未提供'}
                    {item.voteCount !== null
                        ? ` · ${item.voteCount} 赞同`
                        : ' · 赞同数暂未提供'}
                  </small>)}
                  <small className="resource-date">{item.contentDate ? <>发布／更新：<time dateTime={item.contentDate}>{item.contentDate}</time></> : '发布时间未知'}</small>
                </div>
              </div></article>))}
          </div>
        </>) : null}
    </div>);
}
function StateBlock({ title, body, action, }: {
    title: string;
    body: string;
    action?: ReactNode;
}) {
    return (<div className="uiverse-parent"><div className="explain-block uiverse-card"><CardDecoration icon={<InfoCircleOutlined />}/><div className="uiverse-content">

      <h4>{title}</h4>
      <p>{body}</p>
      {action}
    </div></div></div>);
}
