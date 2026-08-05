import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useDashboardStore } from '../../store/dashboardStore';
import { useT } from '../../i18n';

import { LayoutsListSection } from './layouts/sections/LayoutsListSection';

// ── AdminLayouts ──────────────────────────────────────────────────────────────

export function AdminLayouts() {
    const t = useT();
    const addLayout = useDashboardStore((s) => s.addLayout);

    const [newName, setNewName] = useState('');
    const [showNew, setShowNew] = useState(false);

    // `?expand=<layoutId>` — deep link from the editor: open that layout's section list.
    const [searchParams] = useSearchParams();
    const expandLayoutId = searchParams.get('expand');

    const handleCreate = () => {
        const name = newName.trim() || t('layouts.newLayout');
        addLayout(name);
        setNewName('');
        setShowNew(false);
    };

    return (
        <div className="p-6 space-y-4">
            <LayoutsListSection
                onShowNew={() => setShowNew(!showNew)}
                showNew={showNew}
                newName={newName}
                onNewNameChange={setNewName}
                onCreate={handleCreate}
                onCancelNew={() => setShowNew(false)}
                expandLayoutId={expandLayoutId}
            />
        </div>
    );
}
