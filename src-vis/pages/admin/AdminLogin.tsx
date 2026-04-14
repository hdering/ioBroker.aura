import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Lock, Eye, EyeOff } from 'lucide-react';
import { loginWithPin, setupPin, useAuthStore } from '../../store/authStore';
import { useT } from '../../i18n';

export function AdminLogin() {
  const t = useT();
  const { pinHash } = useAuthStore();
  const isFirstTime = !pinHash;
  const [pin, setPin] = useState('');
  const [confirm, setConfirm] = useState('');
  const [show, setShow] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (pin.length < 4) { setError(t('login.tooShort')); return; }

    setLoading(true);
    if (isFirstTime) {
      if (pin !== confirm) { setError(t('login.mismatch')); setLoading(false); return; }
      setupPin(pin);
      navigate('/admin');
    } else {
      const ok = loginWithPin(pin);
      if (ok) navigate('/admin');
      else { setError(t('login.wrong')); setLoading(false); }
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4" style={{ background: 'var(--app-bg)' }}>
      <div className="w-full max-w-sm">
        <div className="rounded-2xl p-8 shadow-2xl" style={{ background: 'var(--app-surface)', border: '1px solid var(--app-border)' }}>
          <div className="flex flex-col items-center mb-8">
            <div className="w-14 h-14 rounded-2xl flex items-center justify-center mb-4" style={{ background: 'var(--accent)22' }}>
              <Lock size={28} style={{ color: 'var(--accent)' }} />
            </div>
            <h1 className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>
              {isFirstTime ? t('login.setup.title') : t('login.title')}
            </h1>
            <p className="text-sm mt-1 text-center" style={{ color: 'var(--text-secondary)' }}>
              {isFirstTime ? t('login.setup.subtitle') : t('login.subtitle')}
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="relative">
              <input
                type={show ? 'text' : 'password'}
                value={pin}
                onChange={(e) => setPin(e.target.value)}
                placeholder={isFirstTime ? t('login.newPin') : t('login.pin')}
                autoFocus
                className="w-full rounded-xl px-4 py-3 pr-10 text-sm focus:outline-none"
                style={{ background: 'var(--app-bg)', color: 'var(--text-primary)', border: '1px solid var(--app-border)' }}
              />
              <button type="button" onClick={() => setShow((s) => !s)}
                className="absolute right-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--text-secondary)' }}>
                {show ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>

            {isFirstTime && (
              <input
                type={show ? 'text' : 'password'}
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                placeholder={t('login.pinConfirm')}
                className="w-full rounded-xl px-4 py-3 text-sm focus:outline-none"
                style={{ background: 'var(--app-bg)', color: 'var(--text-primary)', border: '1px solid var(--app-border)' }}
              />
            )}

            {error && <p className="text-sm" style={{ color: 'var(--accent-red)' }}>{error}</p>}

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
