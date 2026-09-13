import { EmptyGraphNotice } from '../components/ui/EmptyGraphNotice';
import { useGraphProgress } from '../hooks/useGraphProgress';
import { SessionNotice } from '../components/ui/SessionNotice';
import { SessionReadNotice } from '../components/ui/SessionReadNotice';
import { isRetryableReadError, startRecoverableRead, type ReadRecovery } from '../api/recoverableRead';
import { useAuth } from '../hooks/useAuth';
import '../design/waiting.css';
import { CompassOutlined } from '@ant-design/icons';
import { useEffect, useState } from 'react';
import { useNavigate, useOutletContext, useParams } from 'react-router-dom';
import { createPortal } from 'react-dom';
import { Alert, Spin, Button } from 'antd';
import type { CompletionResult, KnowledgeNode } from '../api/types';
import { isMockMode } from '../api/config';
import { completeSession } from '../api/sessions';
import { isGenerating, useSession } from '../hooks/useSession';
import { WaitingView } from '../components/waiting/WaitingView';
import { PathView } from '../components/result/PathView';
import { ResourcesDrawer } from '../components/result/ResourcesDrawer';
export function SessionResultPage() {
    const { sessionId = '' } = useParams();
    const auth = useAuth();
    return <SessionResultContent key={`${auth.user?.userId}:${sessionId}`} sessionId={sessionId} />;
}
function SessionResultContent({ sessionId }: { sessionId: string }) {
    const navigate = useNavigate();
    const { headerSlot } = useOutletContext<{ headerSlot: HTMLDivElement | null }>();
    const { session, ...sessionRead } = useSession(sessionId);
    const { reload } = sessionRead;
    const graphProgress = useGraphProgress(session);
    const [result, setResult] = useState<CompletionResult | null>(null);
    const [resultRead, setResultRead] = useState<ReadRecovery>({ error: null, retrying: false, retryDelayMs: null });
    const [resultAttempt, setResultAttempt] = useState(0);
    const [openNode, setOpenNode] = useState<KnowledgeNode | null>(null);
    const completed = session?.status === 'COMPLETED';
    useEffect(() => {
        if (session?.status === 'READY' && !graphProgress.finishing) {
            navigate(`/sessions/${sessionId}/questions`, { replace: true });
        }
    }, [navigate, session?.status, sessionId, graphProgress.finishing]);
    useEffect(() => {
        if (!sessionId || !completed)
            return;
        // /complete returns the saved result for COMPLETED sessions; it does not regenerate it.
        return startRecoverableRead({
            read: signal => completeSession(sessionId, signal),
            onData: (payload) => {
                if (payload.status === 'SEARCHING_RESOURCES') reload();
                else setResult(payload);
            },
            onRecovery: setResultRead,
        });
    }, [sessionId, completed, reload, resultAttempt]);
    function retryResult(): void {
        setResultRead({ error: null, retrying: false, retryDelayMs: null });
        setResultAttempt(value => value + 1);
    }
    function renderBody() {
        if (sessionRead.error && !isRetryableReadError(sessionRead.error)) return null;
        if (resultRead.error && !isRetryableReadError(resultRead.error)) return null;
        if (!session) {
            if (sessionRead.error && !sessionRead.retrying) return null;
            return (<div className="loading-page enter">
          <CompassOutlined className="spark" aria-hidden="true"/>
          <p>正在读取寻路记录…</p>
        </div>);
        }
        if (session.status === 'FAILED') {
            return (<SessionNotice title="这次还没找到完整的知识路径" body={session.error?.message ?? '暂时无法完成生成，请稍后再试。'} target={session.target} onPrimary={() => navigate('/')} primaryLabel="回首页重新寻路"/>);
        }
        if (isGenerating(session.status) || graphProgress.finishing) {
            return <WaitingView session={session} graphPercent={graphProgress.percent}/>;
        }
        if (!result && (!resultRead.error || resultRead.retrying)) {
            return (<div className="loading-page enter">
          <Spin />
          <p>正在恢复你的路径结果…</p>
        </div>);
        }
        if (!result)
            return null;
        if (!result.nodes.some(node => !node.isTarget)) return <EmptyGraphNotice target={result.target}/>;
        return (<>
        {result.missingCount > 0 && (<section className="waiting-blob-card result-overview enter" aria-label="学习结果概览">
          <div className="waiting-blob-bg" aria-hidden="true" />
          <div className="waiting-blob" aria-hidden="true" />
          <div className="waiting-content">

            <span className="badge">基于你的自评生成的结果</span>
            <div className="between result-head">
              <div>
                <h1>
                  学习 <em>{result.target}</em>，
                  <br />
                  有 {result.missingCount} 个节点建议巩固或了解
                </h1>
              </div>
              <div className="gap-count">
                <strong>{result.missingCount}</strong>
                <span>个待巩固节点</span>
              </div>
            </div>
          </div></section>)}

        {result.nodes.some(node => node.resourceStatus === 'FAILED') && <Alert type="warning" showIcon
          title="部分节点的资料搜索未完成"
          description={<><p>图谱和其他资料已保留，你可以先学习其他节点。点击下方名称查看详情：</p>
            {result.nodes.filter(node => node.resourceStatus === 'FAILED').map(node => <Button key={node.id} type="link" onClick={() => setOpenNode(node)}>{node.name}</Button>)}
          </>} />}
        <PathView result={result} onOpenNode={setOpenNode}/>

        <div className="result-note">
          结果来自你的自评，不代表能力水平。点击任意节点可以查看它与目标的关联与知乎资料。
        </div>

        <div className="actions result-actions">
          <Button htmlType="button" type="primary" className="primary" onClick={() => navigate(`/sessions/${sessionId}/questions`)}>
            修改基础判断
          </Button>
          <Button htmlType="button" className="outline" onClick={() => navigate('/')}>
            重新寻路
          </Button>
        </div>

        <ResourcesDrawer sessionId={sessionId} node={openNode} onClose={() => setOpenNode(null)}/>
      </>);
    }
    return (<>
      {headerSlot && createPortal(<nav className="header-session-nav" aria-label="当前寻路任务">
        <Button htmlType="button" type="text" className="textbutton" disabled={session?.status === 'SEARCHING_RESOURCES'} onClick={() => navigate(`/sessions/${sessionId}/questions`)}>
          修改基础判断
        </Button>
        <span className="tool-title" title={session?.target}>{session?.target ?? '路径结果'}</span>
        {isMockMode && <span className="muted">Mock 演示</span>}
      </nav>, headerSlot)}
      <SessionReadNotice {...sessionRead} label="读取寻路进度" />
      {!sessionRead.error && <SessionReadNotice {...resultRead} reload={retryResult} label="读取路径结果" />}
      {renderBody()}
    </>);
}
