import { useState } from 'react';
import Sidebar from './Sidebar';
import Topbar from './Topbar';

export default function DashboardLayout({ title, subtitle, actions, children }) {
    const [navOpen, setNavOpen] = useState(false);

    return (
        <div className="min-h-screen bg-ink">
            <Sidebar open={navOpen} onClose={() => setNavOpen(false)} />

            <div className="lg:pl-64">
                <Topbar title={title} subtitle={subtitle} actions={actions} onMenu={() => setNavOpen(true)} />

                <main className="px-5 py-6 lg:px-8 lg:py-8">
                    <div className="mx-auto max-w-7xl">{children}</div>
                </main>
            </div>
        </div>
    );
}
