import { useT } from '../../i18n';
import { BrowserThemeSyncSection } from './layouts/sections/BrowserThemeSyncSection';
import { FrontendSection } from './layouts/sections/FrontendSection';

export function AdminFrontend() {
    const t = useT();
    return (
        <div className="p-5 space-y-4">
            <div>
                <h1 className="text-lg font-bold" style={{ color: 'var(--text-primary)' }}>
                    {t('admin.nav.frontend')}
                </h1>
                <p className="text-xs mt-0.5" style={{ color: 'var(--text-secondary)' }}>
                    {t('layouts.scope.globalHint')}
                </p>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <BrowserThemeSyncSection />
                <FrontendSection />
            </div>
        </div>
    );
}
