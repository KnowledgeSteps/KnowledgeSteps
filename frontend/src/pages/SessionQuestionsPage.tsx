import '../design/quiz.css';
import { EmptyGraphNotice } from '../components/ui/EmptyGraphNotice';
import { useGraphProgress } from '../hooks/useGraphProgress';
import { SessionNotice } from '../components/ui/SessionNotice';
import { ClearOutlined, CompassOutlined } from '@ant-design/icons';
import { Button, Progress } from 'antd';
import { useEffect, useState, useRef } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import type { AnswerValue, Question } from '../api/types';
import { ApiError } from '../api/types';
import { isMockMode } from '../api/config';
import { completeSession, getQuestions, saveAnswer, } from '../api/sessions';
import { isGenerating, useSession } from '../hooks/useSession';
import { WaitingView } from '../components/waiting/WaitingView';
import { QuestionPanel } from '../components/quiz/QuestionPanel';
import { StatusRail } from '../components/quiz/StatusRail';
import { submitAssessment } from '../components/quiz/submitAssessment';
function errorMessage(caught: unknown): string {
    return caught instanceof ApiError
        ? caught.message
        : '操作没有成功，请稍后重试。';
}
export function SessionQuestionsPage() {
    const { sessionId = '' } = useParams();
    return <SessionQuestionsContent key={sessionId} sessionId={sessionId} />;
}
function SessionQuestionsContent({ sessionId }: { sessionId: string }) {
    const navigate = useNavigate();
    const active = useRef(false);
    const submitting = useRef(false);
    useEffect(() => { active.current = true; return () => { active.current = false; }; }, []);
    const { session, error: sessionError } = useSession(sessionId);
    const graphProgress = useGraphProgress(session);
    const [questions, setQuestions] = useState<Question[] | null>(null);
    const [currentIndex, setCurrentIndex] = useState(0);
    const [reviewing, setReviewing] = useState(false);
    const [completing, setCompleting] = useState(false);
    const [actionError, setActionError] = useState<string | null>(null);
    const canShowQuiz = session?.status === 'READY' || session?.status === 'COMPLETED';
    useEffect(() => {
        if (!sessionId || !canShowQuiz)
            return;
        let cancelled = false;
        getQuestions(sessionId)
            .then((payload) => {
            if (cancelled)
                return;
            setActionError(null);
            const firstUnanswered = payload.questions.findIndex((q) => q.answer === null);
            setQuestions(payload.questions);
            setCurrentIndex(firstUnanswered >= 0 ? firstUnanswered : 0);
            // 全部已答时默认展示完成面板，只有侧栏跳题才进入编辑态
            setReviewing(false);
        })
            .catch((caught: unknown) => {
            if (!cancelled && active.current) setActionError(errorMessage(caught));
        });
        return () => {
            cancelled = true;
        };
    }, [sessionId, canShowQuiz]);
    const currentQuestion = questions?.[currentIndex] ?? null;
    const answeredCount = questions?.filter((q) => q.answer !== null).length ?? 0;
    const totalQuestions = questions?.length ?? 0;
    const allAnswered = questions !== null && answeredCount === totalQuestions;
    const answerProgress = totalQuestions === 0 ? 100 : (answeredCount / totalQuestions) * 100;
    function chooseAnswer(value: AnswerValue): void {
        if (!currentQuestion || completing) return;
        const nextUnanswered = questions!.findIndex((item, index) => index !== currentIndex && item.answer === null);
        setQuestions(prev => prev?.map(item => item.questionId === currentQuestion.questionId ? { ...item, answer: value } : item) ?? null);
        setActionError(null);
        if (nextUnanswered >= 0) setCurrentIndex(nextUnanswered);
        setReviewing(false);
    }
    function clearSelection(): void {
        if (completing) return;
        setQuestions(prev => prev?.map(item => ({ ...item, answer: null })) ?? null);
        setCurrentIndex(0);
        setReviewing(false);
        setActionError(null);
    }
    async function handleComplete(): Promise<void> {
        if (submitting.current || !questions?.length || !allAnswered) return;
        submitting.current = true;
        setCompleting(true);
        setActionError(null);
        try {
            const result = await submitAssessment(questions,
                (id, answer) => saveAnswer(sessionId, id, answer),
                () => completeSession(sessionId), () => active.current);
            if (!result) return;
            navigate(`/sessions/${result.sessionId}/result`);
        }
        catch (caught) {
            if (active.current) setActionError(errorMessage(caught));
        }
        finally {
            submitting.current = false;
            if (active.current) setCompleting(false);
        }
    }
    function renderBody() {
        if (sessionError) {
            return (<SessionMessage title="暂时无法读取任务" body={sessionError.message} onHome={() => navigate('/')}/>);
        }
        if (!session) {
            return <LoadingPage />;
        }
        if (session.status === 'FAILED') {
            return (<SessionNotice title="这次还没找到完整的知识路径" body={session.error?.message ?? '暂时无法完成生成，请稍后再试。'} target={session.target} onPrimary={() => navigate('/')} primaryLabel="回首页重新寻路"/>);
        }
        if (isGenerating(session.status) || graphProgress.finishing) {
            return <WaitingView session={session} graphPercent={graphProgress.percent}/>;
        }
        if (!questions) {
            if (!actionError) {
                return <LoadingPage label="正在准备问卷…"/>;
            }
            return (<SessionMessage title="问卷没有加载成功" body={actionError} onHome={() => navigate('/')}/>);
        }
        if (questions.length === 0) return <EmptyGraphNotice target={session.target}/>;
        return (<div className="twocol quiz-layout">
        <div className="quiz-surface-blob" aria-hidden="true" />
        <div className="quiz-surface-glass" aria-hidden="true" />
        <section className="question quiz-main" aria-label="知识自评">

          <div className="between">
            <span>
              已回答 <em>{answeredCount}</em> / {totalQuestions}
            </span>
            <Button type="text" icon={<ClearOutlined />} disabled={completing || answeredCount === 0} onClick={clearSelection}>清空所有选择</Button>
          </div>
          <Progress percent={answerProgress} showInfo={false} className="quiz-progress"/>
          <div className="mentor">
            <CompassOutlined className="spark" aria-hidden="true"/>
            <div>
              <strong>知阶正在确认你的基础</strong>
              <p>没有标准答案，按真实情况选择就好；非常了解的节点仍会保留，但不再推荐资料。</p>
            </div>
          </div>

          {allAnswered && !reviewing ? (<div className="complete-panel">
              <span className="badge">
                问卷已完成
              </span>
              <h2>
                可以查看你的补齐路径了
              </h2>
              <p>
                结果基于你的自评生成，不是能力测试。需要调整时，可以从右侧状态列表选择已回答的题目。
              </p>
              {actionError && (<p className="field-error" role="alert">
                  {actionError}
                </p>)}
              <Button htmlType="button" type="primary" className="primary" disabled={completing} onClick={() => void handleComplete()}>
                {completing ? '正在生成路径…' : '查看结果'}
              </Button>
            </div>) : (currentQuestion && (<>
                <QuestionPanel key={currentQuestion.questionId} question={currentQuestion} index={currentIndex} total={totalQuestions} saving={completing} onAnswer={(value) => void chooseAnswer(value)} onBack={() => setCurrentIndex((i) => Math.max(0, i - 1))} canBack={currentIndex > 0} reviewing={reviewing}/>
                {actionError && (<p className="field-error" role="alert">
                    {actionError}
                  </p>)}
              </>))}
        </section>

        <StatusRail active={!allAnswered || reviewing} questions={questions} currentIndex={currentIndex} disabled={completing} onJump={(index) => {
                if (completing)
                    return;
                setCurrentIndex(index);
                setReviewing(true);
            }}/>
      </div>);
    }
    return (<>
      <div className="toolbar">
        <Button htmlType="button" type="text" className="textbutton" onClick={() => navigate('/')}>
          返回首页
        </Button>
        <span className="tool-title">{session?.target ?? '寻路中'}</span>
        {isMockMode && <span className="muted">Mock 演示</span>}
      </div>
      {renderBody()}
    </>);
}
function SessionMessage({ title, body, onHome, }: {
    title: string;
    body: string;
    onHome: () => void;
}) {
    return <SessionNotice title={title} body={body} onPrimary={onHome} primaryLabel="回到首页"/>;
}
function LoadingPage({ label = '正在读取任务…' }: {
    label?: string;
}) {
    return (<section className="loading-page enter">
      <CompassOutlined className="spark" aria-hidden="true"/>
      <p>{label}</p>
    </section>);
}
