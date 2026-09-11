import { InfoCircleOutlined } from '@ant-design/icons';
import { CardDecoration } from '../components/ui/CardDecoration';
import { BranchesOutlined } from '@ant-design/icons';
import { CompassOutlined } from '@ant-design/icons';
import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Spin, Button } from 'antd';
import type { CompletionResult, KnowledgeNode } from '../api/types';
import { ApiError } from '../api/types';
import { isMockMode } from '../api/config';
import { completeSession } from '../api/sessions';
import { isGenerating, useSession } from '../hooks/useSession';
import { WaitingView } from '../components/waiting/WaitingView';
import { PathView } from '../components/result/PathView';
import { ResourcesDrawer } from '../components/result/ResourcesDrawer';
function messageOf(caught: unknown): string {
    return caught instanceof ApiError
        ? caught.message
        : '结果加载失败，请稍后重试。';
}
export function SessionResultPage() {
    const { sessionId = '' } = useParams();
    const navigate = useNavigate();
    const { session, error: sessionError } = useSession(sessionId);
    const [result, setResult] = useState<CompletionResult | null>(null);
    const [resultError, setResultError] = useState<string | null>(null);
    const [openNode, setOpenNode] = useState<KnowledgeNode | null>(null);
    const completed = session?.status === 'COMPLETED';
    useEffect(() => {
        if (session?.status === 'READY') {
            navigate(`/sessions/${sessionId}/questions`, { replace: true });
        }
    }, [navigate, session?.status, sessionId]);
    useEffect(() => {
        if (!sessionId || !completed)
            return;
        let cancelled = false;
        completeSession(sessionId)
            .then((payload) => {
            if (!cancelled) {
                setResultError(null);
                setResult(payload);
            }
        })
            .catch((caught: unknown) => {
            if (!cancelled)
                setResultError(messageOf(caught));
        });
        return () => {
            cancelled = true;
        };
    }, [sessionId, completed]);
    function renderBody() {
        if (sessionError) {
            return (<Message title="无法读取这条记录" body={sessionError.message} onPrimary={() => navigate('/')} primaryLabel="回到首页"/>);
        }
        if (!session) {
            return (<div className="loading-page enter">
          <CompassOutlined className="spark" aria-hidden="true"/>
          <p>正在读取寻路记录…</p>
        </div>);
        }
        if (session.status === 'FAILED') {
            return (<Message title="这次寻路没有成功" body={session.error?.message ?? '生成失败，请重新创建任务。'} onPrimary={() => navigate('/')} primaryLabel="重新寻路"/>);
        }
        if (isGenerating(session.status)) {
            return <WaitingView session={session}/>;
        }
        if (!result && !resultError) {
            return (<div className="loading-page enter">
          <Spin />
          <p>正在恢复你的路径结果…</p>
        </div>);
        }
        if (resultError) {
            return (<Message title="结果没有加载成功" body={resultError} onPrimary={() => window.location.reload()} primaryLabel="再试一次" secondary={<Button htmlType="button" type="text" className="textbutton" onClick={() => navigate(`/sessions/${sessionId}/questions`)}>
              回到问卷
            </Button>}/>);
        }
        if (!result)
            return null;
        return (<>
        {result.missingCount > 0 && (<div className="uiverse-parent"><section className="resultHero enter uiverse-card"><CardDecoration icon={<BranchesOutlined />}/><div className="uiverse-content">

            <span className="badge">基于你的自评生成的结果</span>
            <div className="between result-head">
              <div>
                <h1>
                  学习 <em>{result.target}</em>，
                  <br />
                  你还需要补齐 {result.missingCount} 个前置知识
                </h1>
                <p>
                  已掌握的节点已被隐藏，只保留真正需要走的台阶。
                </p>
              </div>
              <div className="gap-count">
                <strong>{result.missingCount}</strong>
                <span>个待补齐前置</span>
              </div>
            </div>
          </div></section></div>)}

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
      <div className="toolbar">
        <Button htmlType="button" type="text" className="textbutton" onClick={() => navigate(`/sessions/${sessionId}/questions`)}>
          修改基础判断
        </Button>
        <span className="tool-title">{session?.target ?? '路径结果'}</span>
        {isMockMode && <span className="muted">Mock 演示</span>}
      </div>
      {renderBody()}
    </>);
}
function Message({ title, body, onPrimary, primaryLabel, secondary, }: {
    title: string;
    body: string;
    onPrimary: () => void;
    primaryLabel: string;
    secondary?: ReactNode;
}) {
    return (<div className="uiverse-parent"><section className="fail-panel enter uiverse-card"><CardDecoration icon={<InfoCircleOutlined />}/><div className="uiverse-content">

      <span className="badge">提示</span>
      <h1>{title}</h1>
      <p>{body}</p>
      <div className="actions">
        <Button htmlType="button" type="primary" className="primary" onClick={onPrimary}>
          {primaryLabel}
        </Button>
        {secondary}
      </div>
    </div></section></div>);
}
