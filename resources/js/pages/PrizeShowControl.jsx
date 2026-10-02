import { ExternalLink } from 'lucide-react';
import DashboardLayout from '../components/layout/DashboardLayout';
import PrizeManager from '../components/prize/PrizeManager';

const openScreen = () => window.open('/prize-show', 'natcon-prize-show', 'popup,width=1280,height=760');

/**
 * The control page of the Prize Display — the screen for raffles drawn by
 * hand, which shows only a prize. Save the prizes here, then put one on the
 * screen; it can be switched at any time and the wall follows at once. Every
 * raffle's Control Center carries the same controls (see PrizeManager).
 */
export default function PrizeShowControl() {
    return (
        <DashboardLayout
            title="Prize Display"
            subtitle="For raffles drawn by hand: the LED wall shows only the prize you choose."
            actions={(
                <button type="button" className="btn btn-gold" onClick={openScreen}>
                    <ExternalLink size={15} />
                    Open the screen
                </button>
            )}
        >
            <PrizeManager variant="page" aside={<ScreenPanel />} />
        </DashboardLayout>
    );
}

function ScreenPanel() {
    return (
        <section className="panel p-6">
            <h2 className="font-display text-base font-bold text-white">The screen</h2>
            <p className="mt-1 text-xs text-muted">
                Open it, drag it onto the LED wall, then click its fullscreen button (top-right corner) or
                double-click the screen. It follows this page straight away. A raffle&apos;s main screen can
                also switch to it in place, from that raffle&apos;s Control Center.
            </p>
            <button type="button" className="btn btn-outline mt-4 w-full" onClick={openScreen}>
                <ExternalLink size={15} />
                Open the screen
            </button>
            <p className="mt-3 break-all text-center text-xs text-muted-dim">{window.location.origin}/prize-show</p>
        </section>
    );
}
