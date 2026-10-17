// Fonts are bundled with the app rather than fetched from a font service, so
// the event screens look the same with no internet connection.
import '@fontsource/inter/400.css';
import '@fontsource/inter/500.css';
import '@fontsource/inter/600.css';
import '@fontsource/inter/700.css';
import '@fontsource/inter/800.css';
import '@fontsource/manrope/600.css';
import '@fontsource/manrope/700.css';
import '@fontsource/manrope/800.css';
import '@fontsource/cinzel/500.css';
import '@fontsource/cinzel/600.css';
import '@fontsource/cinzel/700.css';
import '@fontsource/cormorant-garamond/500-italic.css';
import '@fontsource/cormorant-garamond/600-italic.css';

import { Fragment, StrictMode, Suspense, lazy } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Navigate, Route, Routes, useParams } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import { ToastProvider } from './context/ToastContext';
import NotFound from './pages/NotFound';
import { useRefreshKey } from './lib/refreshScreen';
import ScreenMargins from './components/display/ScreenMargins';

// The projector display and the landing page are loaded eagerly — they are the
// two screens people arrive on. The admin pages (and their charting library)
// are split out.
import PublicDisplay from './pages/PublicDisplay';
import Landing from './pages/Landing';
import WinnerScreen from './pages/WinnerScreen';
import PrizeScreen from './pages/PrizeScreen';
import PrizeShow from './pages/PrizeShow';

const Dashboard = lazy(() => import('./pages/Dashboard'));
const Raffles = lazy(() => import('./pages/Raffles'));
const RaffleFileDetail = lazy(() => import('./pages/RaffleFileDetail'));
const RaffleEditor = lazy(() => import('./pages/RaffleEditor'));
const RaffleDetail = lazy(() => import('./pages/RaffleDetail'));
const RaffleParticipants = lazy(() => import('./pages/RaffleParticipants'));
const Winners = lazy(() => import('./pages/Winners'));
const Reports = lazy(() => import('./pages/Reports'));
const ReportPrint = lazy(() => import('./pages/ReportPrint'));
const AuditLog = lazy(() => import('./pages/AuditLog'));
const ControlCenter = lazy(() => import('./pages/ControlCenter'));
const PrizeShowControl = lazy(() => import('./pages/PrizeShowControl'));
const MainScreenControl = lazy(() => import('./pages/MainScreenControl'));

function PageFallback() {
    return (
        <div className="grid min-h-screen place-items-center bg-ink">
            <span className="h-8 w-8 animate-spin rounded-full border-2 border-gold/25 border-t-gold" />
        </div>
    );
}

/**
 * Starts a raffle's screen afresh when the raffle changes. The Control Center
 * can move an open screen to another raffle without a page load (see
 * lib/wallSwitch); keyed by the raffle, nothing of the old one carries over.
 */
function ByRaffle({ children }) {
    const { raffle } = useParams();
    return <Fragment key={raffle}>{children}</Fragment>;
}

/** The admin pages are code-split; there is no sign-in gate in front of them. */
function Page({ children }) {
    return <Suspense fallback={<PageFallback />}>{children}</Suspense>;
}

function App() {
    return (
        <BrowserRouter>
            <AuthProvider>
                <ToastProvider>
                    <Routes>
                        {/* Public projector display — ticket numbers only. */}
                        <Route path="/raffle/:raffle/display" element={<ScreenMargins screen="main"><ByRaffle><PublicDisplay /></ByRaffle></ScreenMargins>} />
                        {/* The two 12×7 LED sub screens beside the main display. */}
                        {/* One screen for everything: draw, logos, prize and winners. */}
                        <Route path="/raffle/:raffle/single" element={<ScreenMargins screen="main"><ByRaffle><PublicDisplay single /></ByRaffle></ScreenMargins>} />
                        <Route path="/raffle/:raffle/winner" element={<ScreenMargins screen="winner"><ByRaffle><WinnerScreen /></ByRaffle></ScreenMargins>} />
                        <Route path="/raffle/:raffle/prize" element={<ScreenMargins screen="prize"><ByRaffle><PrizeScreen /></ByRaffle></ScreenMargins>} />
                        {/* The Prize Display for raffles drawn by hand, and its control page. */}
                        <Route path="/prize-show" element={<ScreenMargins screen="main"><PrizeShow /></ScreenMargins>} />
                        <Route path="/prize-display" element={<Page><PrizeShowControl /></Page>} />
                        {/* The winners announced on stage, put on the screen by hand. */}
                        <Route path="/main-screen" element={<Page><MainScreenControl /></Page>} />
                        {/* The operator's Control Center: drives the three screens. */}
                        <Route path="/raffle/:raffle/control" element={<Page><ByRaffle><ControlCenter /></ByRaffle></Page>} />

                        <Route path="/" element={<Landing />} />
                        {/* Old bookmarks to the removed sign-in screen. */}
                        <Route path="/login" element={<Navigate to="/dashboard" replace />} />

                        <Route path="/dashboard" element={<Page><Dashboard /></Page>} />
                        <Route path="/raffles" element={<Page><Raffles /></Page>} />
                        <Route path="/raffles/new" element={<Page><RaffleEditor /></Page>} />
                        <Route path="/raffle-files/:file" element={<Page><RaffleFileDetail /></Page>} />
                        <Route path="/raffles/:raffle" element={<Page><RaffleDetail /></Page>} />
                        <Route path="/raffles/:raffle/edit" element={<Page><RaffleEditor /></Page>} />
                        <Route path="/raffles/:raffle/participants" element={<Page><RaffleParticipants /></Page>} />
                        <Route path="/winners" element={<Page><Winners /></Page>} />
                        <Route path="/reports" element={<Page><Reports /></Page>} />
                        <Route path="/reports/print" element={<Page><ReportPrint /></Page>} />
                        <Route path="/audit-log" element={<Page><AuditLog /></Page>} />

                        <Route path="*" element={<NotFound />} />
                    </Routes>
                </ToastProvider>
            </AuthProvider>
        </BrowserRouter>
    );
}

// The display screens' refresh button rebuilds the whole app in place, so a
// fullscreen wall stays fullscreen (see lib/refreshScreen).
function Root() {
    return <App key={useRefreshKey()} />;
}

createRoot(document.getElementById('app')).render(
    <StrictMode>
        <Root />
    </StrictMode>,
);
