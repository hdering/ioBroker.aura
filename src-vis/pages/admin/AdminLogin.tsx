import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Lock, Eye, EyeOff } from 'lucide-react';
import { loginWithPin, setupAdmin, loadAdminStatus, useAuthStore } from '../../store/authStore';
import { useT } from '../../i18n';

/** Why a login or first-run setup failed → what the user is told. */
const LOGIN_FAIL_KEY = {
    wrong: 'login.wrong',
    tooShort: 'login.tooShort',
    exists: 'login.exists',
    locked: 'login.locked',
    unavailable: 'login.unavailable',
} as const;

export function AdminLogin() {
    const t = useT();
    const { configured, statusLoaded, sessionExpired, apiAvailable } = useAuthStore();
    const isFirstTime = !configured;
    const [pin, setPin] = useState('');
    const [confirm, setConfirm] = useState('');
    const [show, setShow] = useState(false);
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);
    const navigate = useNavigate();

    useEffect(() => {
        loadAdminStatus();
    }, []);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        if (pin.length < 4) {
            setError(t('login.tooShort'));
            return;
        }

        setLoading(true);
        if (isFirstTime && pin !== confirm) {
            setError(t('login.mismatch'));
            setLoading(false);
            return;
        }
        const res = isFirstTime ? await setupAdmin(pin) : await loginWithPin(pin);
        if (res.ok) {
            navigate('/admin');
            return;
        }
        // Only a refused password is a wrong PIN. A lockout, an already configured
        // vault or an unreachable API all used to print the same lie (#632).
        setError(
            res.reason === 'locked' && res.retryAfter
                ? t('login.lockedFor', { seconds: Math.ceil(res.retryAfter) })
                : t(LOGIN_FAIL_KEY[res.reason]),
        );
        setLoading(false);
    };

    // No security API behind this origin (wrong port, adapter down, Aura opened
    // through another adapter): offering a first-run setup here is a dead end —
    // it 404s and the page used to call that „wrong PIN“. Not in dev: the vite
    // server has no adapter behind it by design and degrades to a local editor.
    if (statusLoaded && !apiAvailable && !import.meta.env.DEV) {
        return (
            <div className="min-h-screen flex items-center justify-center p-4" style={{ background: 'var(--app-bg)' }}>
                <div
                    className="w-full max-w-sm rounded-2xl p-8 shadow-2xl text-center"
                    style={{ background: 'var(--app-surface)', border: '1px solid var(--app-border)' }}
                >
                    <div
                        className="w-14 h-14 rounded-2xl flex items-center justify-center mb-4 mx-auto"
                        style={{ background: 'var(--accent-red)22' }}
                    >
                        <Lock size={28} style={{ color: 'var(--accent-red)' }} />
                    </div>
                    <h1 className="text-lg font-bold" style={{ color: 'var(--text-primary)' }}>
                        {t('login.title')}
                    </h1>
                    <p className="text-sm mt-2" style={{ color: 'var(--text-secondary)' }}>
                        {t('login.unavailable')}
                    </p>
                    <button
                        onClick={() => loadAdminStatus()}
                        className="mt-5 px-4 py-2 rounded-lg text-sm font-medium text-white hover:opacity-80"
                        style={{ background: 'var(--accent)' }}
                    >
                        {t('login.retry')}
                    </button>
                </div>
            </div>
        );
    }

    if (!statusLoaded) {
        return (
            <div className="min-h-screen flex items-center justify-center" style={{ background: 'var(--app-bg)' }}>
                <div
                    className="w-8 h-8 rounded-full border-2 border-t-transparent animate-spin"
                    style={{ borderColor: 'var(--accent)', borderTopColor: 'transparent' }}
                />
            </div>
        );
    }

    return (
        <div className="min-h-screen flex items-center justify-center p-4" style={{ background: 'var(--app-bg)' }}>
            <div className="w-full max-w-sm">
                <div
                    className="rounded-2xl p-8 shadow-2xl"
                    style={{ background: 'var(--app-surface)', border: '1px solid var(--app-border)' }}
                >
                    <div className="flex flex-col items-center mb-8">
                        <div
                            className="w-14 h-14 rounded-2xl flex items-center justify-center mb-4"
                            style={{ background: 'var(--accent)22' }}
                        >
                            <Lock size={28} style={{ color: 'var(--accent)' }} />
                        </div>
                        <h1 className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>
                            {isFirstTime ? t('login.setup.title') : t('login.title')}
                        </h1>
                        <p className="text-sm mt-1 text-center" style={{ color: 'var(--text-secondary)' }}>
                            {isFirstTime ? t('login.setup.subtitle') : t('login.subtitle')}
                        </p>
                    </div>

                    {sessionExpired && !error && (
                        <p className="text-xs mb-4 text-center" style={{ color: 'var(--accent-yellow)' }}>
                            {t('login.expired')}
                        </p>
                    )}

                    <form onSubmit={handleSubmit} className="space-y-4">
                        <div className="relative">
                            <input
                                type={show ? 'text' : 'password'}
                                value={pin}
                                onChange={(e) => setPin(e.target.value)}
                                placeholder={isFirstTime ? t('login.newPin') : t('login.pin')}
                                autoComplete={isFirstTime ? 'new-password' : 'current-password'}
                                name="aura-admin-pin"
                                autoFocus
                                className="w-full rounded-xl px-4 py-3 pr-10 text-sm focus:outline-none"
                                style={{
                                    background: 'var(--app-bg)',
                                    color: 'var(--text-primary)',
                                    border: '1px solid var(--app-border)',
                                }}
                            />
                            <button
                                type="button"
                                onClick={() => setShow((s) => !s)}
                                className="absolute right-3 top-1/2 -translate-y-1/2"
                                style={{ color: 'var(--text-secondary)' }}
                            >
                                {show ? <EyeOff size={16} /> : <Eye size={16} />}
                            </button>
                        </div>

                        {isFirstTime && (
                            <input
                                type={show ? 'text' : 'password'}
                                value={confirm}
                                onChange={(e) => setConfirm(e.target.value)}
                                placeholder={t('login.pinConfirm')}
                                autoComplete="new-password"
                                name="aura-admin-pin-confirm"
                                className="w-full rounded-xl px-4 py-3 text-sm focus:outline-none"
                                style={{
                                    background: 'var(--app-bg)',
                                    color: 'var(--text-primary)',
                                    border: '1px solid var(--app-border)',
                                }}
                            />
                        )}

                        {error && (
                            <p className="text-sm" style={{ color: 'var(--accent-red)' }}>
                                {error}
                            </p>
                        )}

                        <button
                            type="submit"
                            disabled={loading}
                            className="w-full py-3 rounded-xl text-sm font-semibold text-white transition-opacity hover:opacity-80 disabled:opacity-50"
                            style={{ background: 'var(--accent)' }}
                        >
                            {loading ? '…' : isFirstTime ? t('login.setPin') : t('login.login')}
                        </button>
                    </form>

                    <div className="mt-6 text-center">
                        <a href="/" className="text-xs hover:opacity-80" style={{ color: 'var(--text-secondary)' }}>
                            ← {t('login.back')}
                        </a>
                    </div>
                </div>
            </div>
        </div>
    );
}
