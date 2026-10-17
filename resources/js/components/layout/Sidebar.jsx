import { Link, NavLink } from 'react-router-dom';
import { BarChart3, FileText, Gift, History, MonitorPlay, ScrollText, Trophy, X } from 'lucide-react';

const NAV = [
    { to: '/dashboard', label: 'Dashboard', icon: BarChart3, end: true },
    { to: '/raffles', label: 'Raffle Files', icon: Gift },
    { to: '/prize-display', label: 'Prize Display', icon: MonitorPlay },
    { to: '/main-screen', label: 'Main Screen', icon: Trophy },
    { to: '/winners', label: 'Winner History', icon: History },
    { to: '/reports', label: 'Winner Reports', icon: FileText },
    { to: '/audit-log', label: 'Audit Log', icon: ScrollText },
];

export default function Sidebar({ open, onClose }) {
    return (
        <>
            {open && (
                <div
                    className="fixed inset-0 z-40 bg-black/70 backdrop-blur-sm lg:hidden"
                    onClick={onClose}
                    aria-hidden="true"
                />
            )}

            <aside
                className={`fixed inset-y-0 left-0 z-50 flex w-64 flex-col border-r border-line bg-ink-soft transition-transform duration-300 lg:translate-x-0 ${
                    open ? 'translate-x-0' : '-translate-x-full'
                }`}
            >
                <div className="flex items-center justify-between gap-3 px-5 py-6">
                    {/* Back out to the public landing page. */}
                    <Link to="/" onClick={onClose} className="flex items-center gap-3 rounded-xl transition hover:opacity-80">
                        <span className="grid h-10 w-10 place-items-center rounded-xl border border-gold/30 bg-gradient-to-br from-gold/20 to-transparent">
                            <Gift className="text-gold" size={19} />
                        </span>
                        <div className="leading-tight">
                            <p className="font-display text-sm font-extrabold tracking-wide text-white">RAFFLE</p>
                            <p className="text-[0.62rem] font-semibold uppercase tracking-[0.22em] text-gold/70">Control</p>
                        </div>
                    </Link>

                    <button
                        type="button"
                        onClick={onClose}
                        className="rounded-lg p-1.5 text-muted transition hover:text-white lg:hidden"
                        aria-label="Close navigation"
                    >
                        <X size={18} />
                    </button>
                </div>

                <div className="gold-rule mx-5" />

                <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-5">
                    {NAV.map(({ to, label, icon: Icon, end }) => (
                        <NavLink
                            key={to}
                            to={to}
                            end={end}
                            onClick={onClose}
                            className={({ isActive }) =>
                                `group relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all duration-200 ${
                                    isActive
                                        ? 'bg-gold/10 text-gold-bright'
                                        : 'text-muted hover:bg-white/[0.04] hover:text-white'
                                }`
                            }
                        >
                            {({ isActive }) => (
                                <>
                                    {isActive && (
                                        <span className="absolute left-0 top-1/2 h-5 w-0.5 -translate-y-1/2 rounded-r-full bg-gold" />
                                    )}
                                    <Icon size={17} className={isActive ? 'text-gold' : 'text-muted-dim group-hover:text-muted'} />
                                    {label}
                                </>
                            )}
                        </NavLink>
                    ))}
                </nav>

                <div className="px-5 pb-6">
                    <div className="gold-rule mb-4" />
                    <p className="text-[0.62rem] uppercase tracking-[0.18em] text-muted-dim">
                        Raffle Management System
                    </p>
                </div>
            </aside>
        </>
    );
}
