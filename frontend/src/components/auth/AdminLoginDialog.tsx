import { useEffect, useRef, useState } from 'react';
import { Input, Modal } from 'antd';
import type { InputRef } from 'antd';
import { LockOutlined } from '@ant-design/icons';
import { loginAdmin } from '../../api/auth';
import { ApiError } from '../../api/types';
import { ConnectionButton } from './ConnectionButton';
function loginError(error: unknown): string {
    if (!(error instanceof ApiError))
        return '登录没有成功，请稍后重试。';
    if (error.code === 'INVALID_CREDENTIALS')
        return '账号或密码不正确，请重新输入。';
    if (error.code === 'ADMIN_LOGIN_DISABLED')
        return '管理员登录暂未开放，请联系站点负责人。';
    if (error.code === 'CSRF_INVALID')
        return '登录请求已过期，请重新输入密码后再试。';
    if (error.code === 'LOGIN_RATE_LIMITED') {
        return error.retryAfterSeconds === null
            ? '登录尝试过于频繁，请稍后再试。'
            : `登录尝试过于频繁，请至少等待 ${error.retryAfterSeconds} 秒后再试。`;
    }
    return error.message;
}
export function AdminLoginDialog({ open, onClose }: {
    open: boolean;
    onClose: () => void;
}) {
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const mounted = useRef(false);
    const submittingRef = useRef(false);
    const usernameInput = useRef<InputRef>(null);
    useEffect(() => {
        mounted.current = true;
        return () => { mounted.current = false; };
    }, []);
    function close() {
        if (submittingRef.current)
            return;
        setPassword('');
        setError(null);
        onClose();
    }
    async function submit() {
        if (submittingRef.current)
            return;
        submittingRef.current = true;
        setSubmitting(true);
        setError(null);
        const submittedPassword = password;
        setPassword('');
        try {
            await loginAdmin(username.trim(), submittedPassword);
            // LoginPage observes the authenticated session and restores the requested route.
        }
        catch (caught) {
            if (mounted.current)
                setError(loginError(caught));
        }
        finally {
            submittingRef.current = false;
            if (mounted.current)
                setSubmitting(false);
        }
    }
    return (<Modal open={open && !submitting} onCancel={close} footer={null} centered width={420} destroyOnHidden keyboard={!submitting} mask={{ closable: !submitting }} closable={{ disabled: submitting, 'aria-label': '关闭管理员登录' }} className="admin-terminal-modal" aria-labelledby="admin-dialog-title" styles={{ container: { padding: 0, borderRadius: 16 }, close: { color: 'var(--text-sub)', top: 10, insetInlineEnd: 14 } }} afterOpenChange={(visible) => { if (visible)
        usernameInput.current?.focus(); }}>
      <div className="glitch-form-wrapper">
        <form className="glitch-card" onSubmit={(event) => { event.preventDefault(); void submit(); }}>
          <div className="card-header">
            <div className="card-title"><LockOutlined /><span>SECURE_DATA</span></div>
          </div>

          <div className="card-body">
            <h2 id="admin-dialog-title">管理员登录</h2>
            <p className="terminal-description">使用团队账号，进入知阶。</p>
            <div className="form-group">
              <Input ref={usernameInput} type="text" id="admin-username" name="username" required placeholder=" " aria-label="账号" autoComplete="username" maxLength={64} value={username} onChange={(event) => setUsername(event.target.value)} disabled={submitting} aria-invalid={Boolean(error)} aria-describedby={error ? 'login-error' : undefined}/>
              <label htmlFor="admin-username" className="form-label" data-text="账号 / USERNAME">账号 / USERNAME</label>
            </div>
            <div className="form-group">
              <Input type="password" id="admin-password" name="password" required placeholder=" " aria-label="密码" autoComplete="current-password" maxLength={256} value={password} onChange={(event) => setPassword(event.target.value)} disabled={submitting} aria-invalid={Boolean(error)} aria-describedby={error ? 'login-error' : undefined}/>
              <label htmlFor="admin-password" className="form-label" data-text="密码 / ACCESS_KEY">密码 / ACCESS_KEY</label>
            </div>
            {error && <p className="terminal-error" id="login-error" role="alert">{error}</p>}
            <ConnectionButton htmlType="submit" disabled={submitting} label={submitting ? '正在验证…' : 'INITIATE_CONNECTION'} aria-label={submitting ? '正在验证' : '登录'}/>
          </div>
        </form>
      </div>
    </Modal>);
}
