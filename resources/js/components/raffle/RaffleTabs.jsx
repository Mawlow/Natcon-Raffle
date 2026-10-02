import { NavLink } from 'react-router-dom';
import { LayoutDashboard, Users } from 'lucide-react';

/** Overview / Participants switch shown at the top of every raffle screen. */
export default function RaffleTabs({ raffleId }) {
    const tabs = [
        { to: `/raffles/${raffleId}`, label: 'Overview', icon: LayoutDashboard, end: true },
        { to: `/raffles/${raffleId}/participants`, label: 'Participants', icon: Users },
    ];

    return (
        <nav className="mb-6 flex gap-1 border-b border-line">
            {tabs.map(({ to, label, icon: Icon, end }) => (
                <NavLink
                    key={to}
                    to={to}
                    end={end}
                    className={({ isActive }) =>
                        `-mb-px flex items-center gap-2 border-b-2 px-4 py-2.5 text-sm font-medium transition ${
                            isActive
                                ? 'border-gold text-gold-bright'
                                : 'border-transparent text-muted hover:text-white'
                        }`
                    }
                >
                    <Icon size={15} />
                    {label}
                </NavLink>
            ))}
        </nav>
    );
}
