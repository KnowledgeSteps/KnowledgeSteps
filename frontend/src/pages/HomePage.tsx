import { ExampleTree } from '../components/ui/ExampleTree';
import { KnowledgeCard } from '../components/ui/KnowledgeCard';
import { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { ArrowRightOutlined, SearchOutlined, ApartmentOutlined, FormOutlined, ReadOutlined } from '@ant-design/icons';
import { Alert, Button, Input, Tag } from 'antd';
import { createSession } from '../api/sessions';
import { isMockMode } from '../api/config';
import { ApiError } from '../api/types';
import { loginUrl } from '../api/loginNavigation';
const PROMPTS = ['Transformer', 'RAG', 'Spring Boot', '线性代数'];
export function HomePage() {
    const navigate = useNavigate();
    const location = useLocation();
    const active = useRef(false);
    useEffect(() => { active.current = true; return () => { active.current = false; }; }, []);
    const [goal, setGoal] = useState(() => typeof location.state?.draftTarget === 'string' ? location.state.draftTarget.slice(0, 100) : '');
    const [fieldError, setFieldError] = useState<string | null>(null);
    const [submitError, setSubmitError] = useState<string | null>(null);
    const [submitting, setSubmitting] = useState(false);
    async function submit(value: string): Promise<void> {
        if (submitting) return;
        const target = value.trim();
        setFieldError(null);
        setSubmitError(null);
        if (!target) {
            setFieldError('先告诉我你想学什么，例如 Transformer 或 RAG。');
            return;
        }
        if (target.length > 100) {
            setFieldError('目标太长了，请精简到 100 个字以内。');
            return;
        }
        setSubmitting(true);
        try {
            const { sessionId } = await createSession(target);
            if (active.current) navigate(`/sessions/${sessionId}/questions`);
        }
        catch (caught) {
            if (!active.current) return;
            // A response from before login/logout must not navigate the new session away.
            if (caught instanceof ApiError && caught.code === 'AUTH_CHANGED')
                return;
            if (caught instanceof ApiError && caught.status === 401) {
                navigate(loginUrl('/'));
                return;
            }
            const message = caught instanceof ApiError
                ? caught.message
                : '创建任务失败，请稍后重试。';
            setSubmitError(message);
        }
        finally {
            if (active.current) setSubmitting(false);
        }
    }
    return (<>
      <section className="home-hero">
        <div className="home-copy">
          <Tag variant="filled">一次性知识寻路</Tag>
          <h1>你想学的知识，<br /><em>从哪一级开始？</em></h1>
          <p className="home-description">告诉我你想学什么，我只告诉你还缺什么。<br />找到前置基础，确认已有知识，留下需要补齐的台阶。</p>
          <form className="goal-form" onSubmit={(event) => { event.preventDefault(); void submit(goal); }} noValidate>
            <label htmlFor="learning-goal">学习目标</label>
            <Input id="learning-goal" size="large" prefix={<SearchOutlined />} placeholder="例如：Transformer、RAG、Spring Boot" maxLength={100} value={goal} status={fieldError ? 'error' : undefined} aria-invalid={Boolean(fieldError)} aria-describedby={fieldError ? 'learning-goal-error' : undefined} onChange={(event) => { setGoal(event.target.value); setFieldError(null); }} disabled={submitting}/>
            <Button htmlType="submit" type="primary" size="large" icon={<ArrowRightOutlined />} loading={submitting}>开始寻路</Button>
          </form>
          {fieldError && <p className="field-error" id="learning-goal-error" role="alert">{fieldError}</p>}
          {submitError && <Alert type="error" showIcon title={submitError}/>}
          <div className="popular-goals" aria-label="热门知识"><span>试着了解</span>{PROMPTS.map((label) => <Button key={label} size="small" onClick={() => setGoal(label)} disabled={submitting}>{label}</Button>)}</div>
        </div>
        {/* From Uiverse.io by SteveBloX */}
        <aside className="home-example" aria-label="Transformer 前置知识示例">
          <div className="card__content">

          <div className="example-title"><ApartmentOutlined /><span>知识有来处，学习有顺序</span><Tag>示例</Tag></div>
          <ExampleTree />
          <p>保留完整知识关系，按熟悉程度推荐学习资料。</p>
        </div></aside>
      </section>
      <section className="home-process" aria-labelledby="home-process-title">
        <div className="section-head"><span className="eyebrow">Knowledge, step by step</span><h2 id="home-process-title">三步，找到你需要补齐的知识</h2></div>
        <div className="process-grid">
          <KnowledgeCard className="ks-card-interactive" icon={<ApartmentOutlined />}><span className="process-number">01</span><h3>拆解前置知识</h3><p>从目标倒推基础，整理分叉与依赖关系。每次最多生成 20 个前置节点。</p></KnowledgeCard>
          <KnowledgeCard className="ks-card-interactive" icon={<FormOutlined />}><span className="process-number">02</span><h3>确认已有基础</h3><p>通过四档自评标记掌握程度，按真实情况选择，也可以返回修改。</p></KnowledgeCard>
          <KnowledgeCard className="ks-card-interactive" icon={<ReadOutlined />}><span className="process-number">03</span><h3>查看补齐路径</h3><p>完整展示知识节点与依赖，按熟悉程度推荐最多五条知乎资料。</p></KnowledgeCard>
        </div>
      </section>
      {isMockMode && <Alert type="info" showIcon title="当前使用 Mock 学习数据" description="登录使用真实后端；题库、生成过程与学习资料为本地模拟，不调用模型或知乎搜索。"/>}
    </>);
}
