import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Play } from 'lucide-react';
import { EventBackdrop } from '../components/landing/EventScene';
import LandingHero from '../components/landing/LandingHero';

/**
 * The public face of the raffle: what you get when you open the site.
 *
 * The convention artwork carries the event's identity, so it is the backdrop
 * rather than a banner in the page, and everything here is raffle-specific.
 * The same hero is the main screen's welcome screen before the draw starts.
 */
export default function Landing() {
    // The landing page is a single poster-like screen: it locks page
    // scrolling while it is mounted.
    useEffect(() => {
        document.documentElement.classList.add('no-scroll');
        return () => document.documentElement.classList.remove('no-scroll');
    }, []);

    return (
        <div className="relative h-dvh overflow-hidden bg-ink">
            <EventBackdrop />

            <div className="relative z-10">
                {/* Logo kept to the screen's height, so the Start button always fits. */}
                <LandingHero logoClass="w-[min(60rem,94vw,68vh)]" bottomClass="pb-[4vh]">
                    <Link to="/dashboard" className="btn btn-gold px-7 py-3.5 text-sm">
                        <Play size={17} />
                        Start Raffle
                    </Link>
                </LandingHero>
            </div>
        </div>
    );
}
