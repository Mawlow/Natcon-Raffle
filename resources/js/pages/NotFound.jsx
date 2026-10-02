import { Link } from 'react-router-dom';

export default function NotFound() {
    return (
        <div className="relative grid min-h-screen place-items-center bg-ink px-4 text-center">
            <div className="vignette pointer-events-none absolute inset-0" aria-hidden="true" />
            <div className="relative">
                <p className="gold-text font-display text-7xl font-extrabold">404</p>
                <p className="mt-3 text-lg font-semibold text-white">Page not found</p>
                <p className="mt-2 text-sm text-muted">The page you are looking for does not exist.</p>
                <Link to="/dashboard" className="btn btn-outline mt-7">Back to dashboard</Link>
            </div>
        </div>
    );
}
