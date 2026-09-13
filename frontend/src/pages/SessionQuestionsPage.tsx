import '../design/quiz.css';
import { EmptyGraphNotice } from '../components/ui/EmptyGraphNotice';
import { useGraphProgress } from '../hooks/useGraphProgress';
import { SessionNotice } from '../components/ui/SessionNotice';
import { SessionReadNotice } from '../components/ui/SessionReadNotice';
import { isRetryableReadError, readError, startRecoverableRead, type ReadRecovery } from '../api/recoverableRead';
import { useAuth } from '../hooks/useAuth';
import { ClearOutlined, CompassOutlined, ProfileOutlined } from '@ant-design/icons';
import { Button, Drawer, Progress } from 'antd';
import { useEffect, useState, useRef } from 'react';
import { useNavigate, useOutletContext, useParams } from 'react-router-dom';
import { createPortal } from 'react-dom';
import type { AnswerValue, Question } from '../api/types';
import { ApiError } from '../api/types';
import { isMockMode } from '../api/config';
import { completeSession, getQuestions, getSession, saveAnswer, } from '../api/sessions';
import { isGenerating, useSession } from '../hooks/useSession';
import { WaitingView } from '../components/waiting/WaitingView';
import { QuestionPanel } from '../components/quiz/QuestionPanel';
import { StatusRail } from '../components/quiz/StatusRail';
import { submitAssessment } from '../components/quiz/submitAssessment';
import { clearAnswerDraft, restoreAnswerDraft, writeAnswerDraft } from '../components/quiz/answerDraft';
function errorMessage(caught: unknown): string {
    return caught instanceof ApiError
        ? caught.message
        : '操作没有成功，请稍后重试。';
}
export function SessionQuestionsPage() {
    const { sessionId = '' } = useParams();
    const auth = useAuth();
    return <SessionQuestionsContent key={`${auth.user?.userId}:${sessionId}`} sessionId={sessionId} userId={auth.user?.userId ?? ''} />;
}
function SessionQuestionsContent({ sessionId, userId }: { sessionId: string; userId: string }) {
    const navigate = useNavigate();
    const { headerSlot } = useOutletContext<{ headerSlot: HTMLDivElement | null }>();
    const active = useRef(false);
    const submitting = useRef(false);
    useEffect(() => { active.current = true; return () => { active.current = false; }; }, []);
    const { session, ...sessionRead } = useSession(sessionId);
    const graphProgress = useGraphProgress(session);
    const [questions, setQuestions] = useState<Question[] | null>(null);
    const draftBase = useRef<Question[]>([]);
    const [draftSaved, setDraftSaved] = useState(false);
    const [questionRead, setQuestionRead] = useState<ReadRecovery>({ error: null, retrying: false, retryDelayMs: null });
    const [questionAttempt, setQuestionAttempt] = useState(0);
    const [currentIndex, setCurrentIndex] = useState(0);
    const [reviewing, setReviewing] = useState(false);
    const [completing, setCompleting] = useState(false);
    const [actionError, setActionError] = useState<string | null>(null);
    const [directoryOpen, setDirectoryOpen] = useState(false);
    const quizMain = useRef<HTMLElement>(null);
    const focusQuestionAfterClose = useRef(false);
    useEffect(() => {
        const desktop = window.matchMedia('(min-width: 761px)');
        const closeOnDesktop = () => { if (desktop.matches) setDirectoryOpen(false); };
        desktop.addEventListener('change', closeOnDesktop);
        return () => desktop.removeEventListener('change', closeOnDesktop);
    }, []);
    const canShowQuiz = session?.status === 'READY' || session?.status === 'COMPLETED';
    useEffect(() => {
        if (!sessionId || !canShowQuiz)
            return;
        return startRecoverableRead({
            read: signal => getQuestions(sessionId, signal),
            onData: (payload) => {
                draftBase.current = payload.questions;
                const restored = restoreAnswerDraft(userId, sessionId, payload.questions);
                const firstUnanswered = restored.findIndex((q) => q.answer === null);
                setDraftSaved(restored !== payload.questions);
                setQuestions(restored);
                setCurrentIndex(firstUnanswered >= 0 ? firstUnanswered : 0);
                setReviewing(false);
            },
            onRecovery: setQuestionRead,
        });
    }, [sessionId, userId, canShowQuiz, questionAttempt]);
    function retryQuestions(): void {
        setQuestionRead({ error: null, retrying: false, retryDelayMs: null });
        setQuestionAttempt(value => value + 1);
    }
    const currentQuestion = questions?.[currentIndex] ?? null;
    const currentQuestionId = currentQuestion?.questionId;
    const answeredCount = questions?.filter((q) => q.answer !== null).length ?? 0;
    const totalQuestions = questions?.length ?? 0;
    const allAnswered = questions !== null && answeredCount === totalQuestions;
    const answerProgress = totalQuestions === 0 ? 100 : (answeredCount / totalQuestions) * 100;
    function openDirectory(): void {
        focusQuestionAfterClose.current = false;
        setDirectoryOpen(true);
    }
    // A quick selection can close the drawer before its opening animation finishes.
    // Restore focus even when the component's afterOpenChange(false) is skipped.
    useEffect(() => {
        if (directoryOpen || !focusQuestionAfterClose.current) return;
        const frame = requestAnimationFrame(() => quizMain.current?.querySelector<HTMLHeadingElement>('.question-panel h2')?.focus({ preventScroll: true }));
        return () => cancelAnimationFrame(frame);
    }, [directoryOpen, currentQuestionId]);
    function chooseAnswer(value: AnswerValue): void {
        if (!currentQuestion || completing) return;
        const nextUnanswered = questions!.findIndex((item, index) => index !== currentIndex && item.answer === null);
        const updated = questions!.map(item => item.questionId === currentQuestion.questionId ? { ...item, answer: value } : item);
        setQuestions(updated);
        setDraftSaved(writeAnswerDraft(userId, sessionId, draftBase.current, updated));
        setActionError(null);
        if (nextUnanswered >= 0) setCurrentIndex(nextUnanswered);
        setReviewing(false);
    }
    function jumpToQuestion(index: number): void {
        if (completing) return;
        focusQuestionAfterClose.current = directoryOpen;
        setCurrentIndex(index);
        setReviewing(true);
        setDirectoryOpen(false);
    }
    // Long questions use the page scroll; each new question starts at its heading.
    useEffect(() => {
        if (!currentQuestionId) return;
        const main = quizMain.current;
        if (main && main.getBoundingClientRect().top < 0) main.scrollIntoView({ block: 'start', behavior: 'instant' });
    }, [currentQuestionId, allAnswered, reviewing]);
    function clearSelection(): void {
        if (completing) return;
        focusQuestionAfterClose.current = directoryOpen;
        const cleared = questions?.map(item => ({ ...item, answer: null })) ?? null;
        setQuestions(cleared);
        setDraftSaved(cleared !== null && writeAnswerDraft(userId, sessionId, draftBase.current, cleared));
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
            clearAnswerDraft(userId, sessionId);
            navigate(`/sessions/${result.sessionId}/result`);
        }
        catch (caught) {
            if (!active.current) return;
            if (isRetryableReadError(readError(caught))) {
                // A lost /complete response may already have started resource generation.
                // Reconcile state before inviting the user to submit the same answers again.
                try {
                    const current = await getSession(sessionId);
                    if (!active.current) return;
                    if (current.status === 'SEARCHING_RESOURCES' || current.status === 'COMPLETED') {
                        clearAnswerDraft(userId, sessionId);
                        navigate(`/sessions/${sessionId}/result`);
                        return;
                    }
                } catch (lookupError) {
                    if (!active.current) return;
                    if (!isRetryableReadError(readError(lookupError))) {
                        setActionError(errorMessage(lookupError));
                        return;
                    }
                }
            }
            setActionError(errorMessage(caught));
        }
        finally {
            submitting.current = false;
            if (active.current) setCompleting(false);
        }
    }
    function renderBody() {
        if (sessionRead.error && !isRetryableReadError(sessionRead.error)) return null;
        if (questionRead.error && !isRetryableReadError(questionRead.error)) return null;
        if (!session) {
            return sessionRead.error && !sessionRead.retrying ? null : <LoadingPage />;
        }
        if (session.status === 'FAILED') {
            return (<SessionNotice title="这次还没找到完整的知识路径" body={session.error?.message ?? '暂时无法完成生成，请稍后再试。'} target={session.target} onPrimary={() => navigate('/')} primaryLabel="回首页重新寻路"/>);
        }
        if (isGenerating(session.status) || graphProgress.finishing) {
            return <WaitingView session={session} graphPercent={graphProgress.percent}/>;
        }
        if (!questions) {
            return questionRead.error && !questionRead.retrying ? null : <LoadingPage label="正在准备问卷…"/>;
        }
        if (questions.length === 0) return <EmptyGraphNotice target={session.target}/>;
        return (<div className="twocol quiz-layout">
        <div className="quiz-surface-blob" aria-hidden="true" />
        <div className="quiz-surface-glass" aria-hidden="true" />
        <section ref={quizMain} className="question quiz-main" aria-label="知识自评">

          <div className="between">
            <span>
              已回答 <em>{answeredCount}</em> / {totalQuestions}
            </span>
            <Button className="quiz-desktop-clear" type="text" icon={<ClearOutlined aria-hidden="true" />} disabled={completing || answeredCount === 0} onClick={clearSelection}>清空所有选择</Button>
          </div>
          <Progress percent={answerProgress} showInfo={false} className="quiz-progress"/>
          {draftSaved && <p className="muted" role="status">草稿已保存在当前标签页，刷新可继续。</p>}
          <div className="mentor">
            <CompassOutlined className="spark" aria-hidden="true"/>
            <div>
              <strong>知阶正在确认你的基础</strong>
              <p><span className="quiz-desktop-intro">没有标准答案，按真实情况选择就好；非常了解的节点仍会保留，但不再推荐资料。</span><span className="quiz-mobile-intro">{allAnswered && !reviewing ? '自评已完成，可先检查回答，再查看学习路径。' : '按实际了解程度选择，选完自动进入下一题。'}</span></p>
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
                结果基于你的自评生成，不是能力测试。需要调整时，可以从题目目录返回修改。
              </p>
              {actionError && (<p className="field-error" role="alert">
                  {actionError}
                </p>)}
              <Button htmlType="button" className="quiz-result-button" disabled={completing} aria-busy={completing} onClick={() => void handleComplete()}>
                {completing ? '正在生成路径…' : '查看结果'}
              </Button>
              <Button className="quiz-mobile-directory" type="text" icon={<ProfileOutlined aria-hidden="true" />} disabled={completing} aria-haspopup="dialog" aria-expanded={directoryOpen} onClick={openDirectory}>题目目录</Button>
            </div>) : (currentQuestion && (<>
                <QuestionPanel key={currentQuestion.questionId} question={currentQuestion} index={currentIndex} total={totalQuestions} saving={completing} onAnswer={(value) => void chooseAnswer(value)} onBack={() => setCurrentIndex((i) => Math.max(0, i - 1))} canBack={currentIndex > 0} reviewing={reviewing} onOpenDirectory={openDirectory}/>
                {actionError && (<p className="field-error" role="alert">
                    {actionError}
                  </p>)}
              </>))}
        </section>

        <div className="quiz-desktop-directory"><StatusRail active={!allAnswered || reviewing} questions={questions} currentIndex={currentIndex} disabled={completing} onJump={jumpToQuestion}/></div>
        <Drawer title="题目目录" placement="bottom" size="min(78dvh, 640px)" className="quiz-directory-drawer" rootClassName="quiz-directory-overlay" open={directoryOpen} onClose={() => setDirectoryOpen(false)} destroyOnHidden
          afterOpenChange={(open) => {
              if (!open && focusQuestionAfterClose.current) {
                  focusQuestionAfterClose.current = false;
                  requestAnimationFrame(() => quizMain.current?.querySelector<HTMLHeadingElement>('.question-panel h2')?.focus({ preventScroll: true }));
              }
          }}
          footer={<div className="quiz-directory-footer"><span>已回答 <em>{answeredCount}</em> / {totalQuestions}</span><Button type="text" icon={<ClearOutlined aria-hidden="true" />} disabled={completing || answeredCount === 0} onClick={clearSelection}>清空所有选择</Button></div>}>
          <StatusRail showHeading={false} active={!allAnswered || reviewing} questions={questions} currentIndex={currentIndex} disabled={completing} onJump={jumpToQuestion}/>
        </Drawer>
      </div>);
    }
    return (<>
      {headerSlot && createPortal(<nav className="header-session-nav" aria-label="当前寻路任务">
        <Button htmlType="button" type="text" className="textbutton" onClick={() => navigate('/')}>
          返回首页
        </Button>
        <span className="tool-title" title={session?.target}>{session?.target ?? '寻路中'}</span>
        {isMockMode && <span className="muted">Mock 演示</span>}
      </nav>, headerSlot)}
      <SessionReadNotice {...sessionRead} label="读取寻路进度" />
      {!sessionRead.error && <SessionReadNotice {...questionRead} reload={retryQuestions} label="读取问卷" />}
      {renderBody()}
    </>);
}
function LoadingPage({ label = '正在读取任务…' }: {
    label?: string;
}) {
    return (<section className="loading-page enter">
      <CompassOutlined className="spark" aria-hidden="true"/>
      <p>{label}</p>
    </section>);
}

