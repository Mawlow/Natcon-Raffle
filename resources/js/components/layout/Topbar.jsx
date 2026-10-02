import { Menu } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';

export default function Topbar({ title, subtitle, actions, onMenu }) {
    const { user } = useAuth();

    const initials = (user?.name ?? '?')
        .split(' ')
        .map((part) => part[0])
        .filter(Boolean)
        .slice(0, 2)
        .join('')
        .toUpperCase();

    return (
        <header className="sticky top-0 z-30 border-b border-line bg-ink/85 backdrop-blur-xl">
            <div className="flex flex-wrap items-center gap-4 px-5 py-4 lg:px-8">
                <button
                    type="button"
                    onClick={onMenu}
                    className="rounded-lg border border-line p-2 text-muted transition hover:text-white lg:hidden"
                    aria-label="Open navigation"
                >
                    <Menu size={18} />
                </button>

                <div className="min-w-0 flex-1">
                    <h1 className="truncate font-display text-xl font-extrabold tracking-tight text-white sm:text-2xl">
                        {title}
                    </h1>
                    {subtitle && <p className="mt-0.5 truncate text-sm text-muted">{subtitle}</p>}
                </div>

                <div className="flex items-center gap-2">
                    {actions}

                    <div className="ml-1 hidden items-center gap-2.5 border-l border-line pl-3 sm:flex">
                        <span className="grid h-8 w-8 place-items-center rounded-full border border-gold/30 bg-gold/10 text-xs font-bold text-gold-bright">
                            {initials}
                        </span>
                        <div className="leading-tight">
                            <p className="max-w-[10rem] truncate text-sm font-semibold text-white">{user?.name}</p>
                            <p className="text-[0.68rem] uppercase tracking-wider text-muted-dim">{user?.role}</p>
                        </div>
                    </div>
                </div>
            </div>
        </header>
    );
}
