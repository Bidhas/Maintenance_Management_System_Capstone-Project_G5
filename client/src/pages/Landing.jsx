import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { dashboardPath } from '../lib/paths';

const FEATURES = [
  ['Report in seconds', 'Pick the block, building and room, describe the issue, add a photo — done. Urgency is yours to set.'],
  ['Smart routing', 'Hostel jobs go to a gender-matched volunteer; everything else goes to a specialist. Only people on duty are assigned.'],
  ['Escalate when needed', 'A volunteer who is out of their depth hands the job up to a Main Technician with one click — fully logged.'],
  ['Reopen if it comes back', 'Fix did not hold? Reopen the same request instead of starting over. The full history stays attached.'],
  ['Stay in the loop', 'In-app and email updates at every step: received, assigned, in progress, completed.'],
  ['Reports and audit trail', 'Per-category and per-block reports with CSV export, plus an append-only log of every admin action.'],
];

export default function Landing() {
  const { user } = useAuth();

  return (
    <div className="min-h-screen flex flex-col">
      <header className="g mx-4 mt-4 px-5 py-3 flex items-center justify-between rounded-2xl sticky top-4 z-10">
        <Link to="/" className="flex items-center gap-2.5">
          <img src="/logo.png" alt="" className="h-9 w-9 rounded-full" />
          <div className="leading-tight">
            <div className="font-extrabold lg text-sm">CMMS</div>
            <div className="text-[10px] tracking-wide text-mu">College of Science &amp; Technology</div>
          </div>
        </Link>
        <div className="flex items-center gap-2">
          {user ? (
            <Link to={dashboardPath(user)} className="btn">Open my dashboard →</Link>
          ) : (
            <>
              <Link to="/login" className="btn s">Log in</Link>
              <Link to="/register" className="btn">Sign up</Link>
            </>
          )}
        </div>
      </header>

      <main className="flex-1 max-w-6xl w-full mx-auto px-6 py-14 rv">
        <section className="text-center max-w-3xl mx-auto">
          <span className="chip cy">Royal University of Bhutan</span>
          <h1 className="text-5xl md:text-6xl font-extrabold leading-[1.05] mt-5">
            Fix it faster.<br /><span style={{ color: 'var(--ac)' }}>Campus-wide.</span>
          </h1>
          <p className="text-mu text-lg mt-5">
            One place to report a broken fan, a leaking tap or a dead projector — and watch it get routed, fixed and signed off.
          </p>
          <div className="flex gap-3 justify-center mt-8 flex-wrap">
            {user ? (
              <Link to={dashboardPath(user)} className="btn px-6 py-3 text-sm">Open my dashboard →</Link>
            ) : (
              <>
                <Link to="/register" className="btn px-6 py-3 text-sm">Report a problem</Link>
                <Link to="/login" className="btn s px-6 py-3 text-sm">I already have an account</Link>
              </>
            )}
          </div>
        </section>

        <section className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5 mt-16">
          {FEATURES.map(([title, text]) => (
            <div key={title} data-tilt className="g p-6">
              <h3 className="font-bold text-lg mt-3">{title}</h3>
              <p className="text-mu text-sm mt-2">{text}</p>
            </div>
          ))}
        </section>
      </main>

      <footer className="text-center text-xs text-mu py-6">
        CMMS · College of Science &amp; Technology, Royal University of Bhutan
      </footer>
    </div>
  );
}
