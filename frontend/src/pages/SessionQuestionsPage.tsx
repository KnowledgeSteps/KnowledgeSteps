import { InfoCircleOutlined } from '@ant-design/icons';
import { CardDecoration } from '../components/ui/CardDecoration';
import { FormOutlined } from '@ant-design/icons';
import { CompassOutlined } from '@ant-design/icons';
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
function errorMessage(caught: unknown): string {
    return caught instanceof ApiError
        ? caught.message
        : '操作没有成功，请稍后重试。';
}
export function SessionQuestionsPage() {
    const { sessionId = '' } = useParams();
    const navigate = useNavigate();
    const active = useRef(false);
    useEffect(() => { active.current = true; return () => { active.current = false; }; }, []);
    const { session, error: sessionError } = useSession(sessionId);
    const [questions, setQuestions] = useState<Question[] | null>(null);
    const [currentIndex, setCurrentIndex] = useState(0);
    const [reviewing, setReviewing] = useState(false);
    const [savingQuestionId, setSavingQuestionId] = useState<string | null>(null);
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
    async function chooseAnswer(value: AnswerValue): Promise<void> {
        if (!currentQuestion || savingQuestionId)
            return;
        const question = currentQuestion;
        const nextUnanswered = questions!.findIndex((item, index) => index !== currentIndex && item.answer === null);
        setSavingQuestionId(question.questionId);
        setActionError(null);
        try {
            await saveAnswer(sessionId, question.questionId, value);
            if (!active.current) return;
            setQuestions((prev) => prev?.map((item) => item.questionId === question.questionId ? { ...item, answer: value } : item) ?? null);
            if (nextUnanswered >= 0)
                setCurrentIndex(nextUnanswered);
            // 答完即退出编辑态：还有未答题时进入下一题，全部答完时露出完成面板
            setReviewing(false);
        }
        catch (caught) {
            if (active.current) setActionError(errorMessage(caught));
        }
        finally {
            if (active.current) setSavingQuestionId(null);
        }
    }
    async function handleComplete(): Promise<void> {
        setCompleting(true);
        setActionError(null);
        try {
            const result = await completeSession(sessionId);
            if (!active.current) return;
            navigate(`/sessions/${result.sessionId}/result`);
        }
        catch (caught) {
            if (active.current) setActionError(errorMessage(caught));
        }
        finally {
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
            return (<SessionMessage title="这次寻路没有成功" body={session.error?.message ?? '生成失败，请重新创建任务。'} onHome={() => navigate('/')}/>);
        }
        if (isGenerating(session.status)) {
            return <WaitingView session={session}/>;
        }
        if (!questions) {
            if (!actionError) {
                return <LoadingPage label="正在准备问卷…"/>;
            }
            return (<SessionMessage title="问卷没有加载成功" body={actionError} onHome={() => navigate('/')}/>);
        }
        return (<div className="twocol quiz-layout">
        <div className="uiverse-parent"><section className="card question uiverse-card"><CardDecoration icon={<FormOutlined />}/><div className="uiverse-content">

          <div className="between">
            <span>
              已回答 <em>{answeredCount}</em> / {totalQuestions}
            </span>
            <span className="muted">每一个回答，都让路径更准确</span>
          </div>
          <Progress percent={answerProgress} showInfo={false} className="quiz-progress"/>
          <div className="mentor">
            <CompassOutlined className="spark" aria-hidden="true"/>
            <div>
              <strong>知阶正在确认你的基础</strong>
              <p>没有标准答案，按真实情况选择就好；已掌握的节点不会出现在结果里。</p>
            </div>
          </div>

          {allAnswered && !reviewing ? (<div className="complete-panel">
              <span className="badge">
                {totalQuestions === 0 ? '无需额外确认' : '问卷已完成'}
              </span>
              <h2>
                {totalQuestions === 0
                    ? '这个目标没有需要确认的前置知识'
                    : '可以查看你的补齐路径了'}
              </h2>
              <p>
                {totalQuestions === 0
                    ? '你可以直接查看目标节点。第一版不会为目标知识搜索资料。'
                    : '结果基于你的自评生成，不是能力测试。需要调整时，可以从右侧状态列表选择已回答的题目。'}
              </p>
              {actionError && (<p className="field-error" role="alert">
                  {actionError}
                </p>)}
              <Button htmlType="button" type="primary" className="primary" disabled={completing} onClick={() => void handleComplete()}>
                {completing ? '正在生成路径…' : '查看结果'}
              </Button>
            </div>) : (currentQuestion && (<>
                <QuestionPanel question={currentQuestion} index={currentIndex} total={totalQuestions} saving={savingQuestionId === currentQuestion.questionId} onAnswer={(value) => void chooseAnswer(value)} onBack={() => setCurrentIndex((i) => Math.max(0, i - 1))} canBack={currentIndex > 0} reviewing={reviewing}/>
                {actionError && (<p className="field-error" role="alert">
                    {actionError}
                  </p>)}
              </>))}
        </div></section></div>

        <StatusRail questions={questions} currentIndex={currentIndex} disabled={Boolean(savingQuestionId || completing)} onJump={(index) => {
                if (savingQuestionId || completing)
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
    return (<div className="uiverse-parent"><section className="fail-panel enter uiverse-card"><CardDecoration icon={<InfoCircleOutlined />}/><div className="uiverse-content">

      <span className="badge">提示</span>
      <h1>{title}</h1>
      <p>{body}</p>
      <div className="actions">
        <Button htmlType="button" type="primary" className="primary" onClick={onHome}>
          回到首页
        </Button>
      </div>
    </div></section></div>);
}
function LoadingPage({ label = '正在读取任务…' }: {
    label?: string;
}) {
    return (<section className="loading-page enter">
      <CompassOutlined className="spark" aria-hidden="true"/>
      <p>{label}</p>
    </section>);
}
