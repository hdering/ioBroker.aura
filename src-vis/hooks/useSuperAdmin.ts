import { useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useConfigStore } from '../store/configStore';

const SESSION_KEY = 'aura-superadmin';

export function useSuperAdmin(): boolean {
    const key = useConfigStore((s) => s.frontend.superAdminKey);
    const location = useLocation();
    const navigate = useNavigate();

    useEffect(() => {
        if (!key) return;
        const params = new URLSearchParams(location.search);
        const provided = params.get('key');
        if (provided !== null && provided === key) {
            sessionStorage.setItem(SESSION_KEY, '1');
            params.delete('key');
            const rest = params.toString();
            navigate(location.pathname + (rest ? `?${rest}` : ''), { replace: true });
        }
    }, [key, location.search, location.pathname, navigate]);

    if (!key) return false;
    return sessionStorage.getItem(SESSION_KEY) === '1';
}
