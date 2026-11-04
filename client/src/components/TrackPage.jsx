import { useEffect, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import TrackMap from "./TrackMap";
import { fetchTracking } from "../publicApi";
import { isValidToken, extractToken, loadRequest, saveRequest, clearRequest } from "../patientSession";

const POLL_MS = 5000;
const TERMINAL = ["resolved", "cancelled"];
const STEPS = ["Received", "Confirmed", "On the way", "Arrived", "To hospital", "Completed"];
const STEP_INDEX = {
  pendingReview: 0,
  waiting: 1,
  assigned: 2,
  atScene: 3,
  awaitingHospital: 3,
  transporting: 4,
  resolved: 5,
};

const formatEta = (seconds) => {
  if (seconds == null) return null;
  if (seconds < 60) return "less than a minute";
  const minutes = Math.round(seconds / 60);
  return `about ${minutes} minute${minutes === 1 ? "" : "s"}`;
};

function Timeline({ status }) {
  if (status === "cancelled") return null;
  const current = STEP_INDEX[status] ?? 0;
  const doneThrough = status === "resolved" ? STEPS.length : current;
  return (
    <ol className="timeline">
      {STEPS.map((label, i) => (
        <li key={label} className={i < doneThrough ? "done" : i === doneThrough ? "current" : ""}>
          {label}
        </li>
      ))}
    </ol>
  );
}

export default function TrackPage() {
  const { hash } = useLocation();
  const navigate = useNavigate();

  // The token normally rides in the URL fragment (never sent to servers).
  // With no fragment, fall back to the request this browser saved.
  const hashToken = hash ? hash.slice(1) : "";
  const hashIsBad = hashToken !== "" && !isValidToken(hashToken);
  const token = isValidToken(hashToken) ? hashToken : hashIsBad ? null : loadRequest()?.token || null;

  const [view, setView] = useState(null);
  const [notFound, setNotFound] = useState(false);
  const [problem, setProblem] = useState(null);
  const [lastUpdated, setLastUpdated] = useState(null);
  const [copied, setCopied] = useState(false);
  const [pasted, setPasted] = useState("");
  const [pasteError, setPasteError] = useState(null);

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    let timer = null;
    setView(null);
    setNotFound(false);
    setProblem(null);

    // Recursive setTimeout, not setInterval: the next poll is scheduled only
    // after the previous one finishes, so slow responses can never overlap.
    const tick = async () => {
      try {
        const data = await fetchTracking(token);
        if (cancelled) return;
        setView(data);
        setProblem(null);
        setLastUpdated(new Date());
        saveRequest({ token, reference: data.reference });
        if (TERMINAL.includes(data.status)) return; // finished - stop polling
      } catch (err) {
        if (cancelled) return;
        if (err.code === "NOT_FOUND") {
          if (loadRequest()?.token === token) clearRequest();
          setNotFound(true);
          return; // not retrying a request that doesn't exist
        }
        setProblem(err.code === "RATE_LIMITED" ? "Refreshing too fast. Slowing down…" : "Connection problem. Retrying…");
      }
      timer = setTimeout(tick, POLL_MS);
    };

    tick();
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [token]);

  const submitPaste = (e) => {
    e.preventDefault();
    const found = extractToken(pasted);
    if (!found) {
      setPasteError("That doesn't look like a tracking link. Paste the full link you were given.");
      return;
    }
    setPasteError(null);
    navigate(`/track#${found}`);
  };

  const copyLink = async () => {
    const link = `${window.location.origin}/track#${token}`;
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      window.prompt("Copy this link:", link);
    }
  };

  // No usable token: let the person paste their link.
  if (!token) {
    return (
      <div className="patient-wrap">
        <div className="patient-card">
          <form className="patient-panel patient-form" onSubmit={submitPaste}>
            <h1>Track a request</h1>
            {hashIsBad && <p className="error">That link doesn't look right.</p>}
            <p className="muted">Paste the private tracking link you received when you made the request.</p>
            <input type="text" placeholder="https://…/track#…" value={pasted} onChange={(e) => setPasted(e.target.value)} />
            {pasteError && <p className="error">{pasteError}</p>}
            <button type="submit" className="primary-btn" disabled={!pasted.trim()}>Track</button>
          </form>
          <div className="link-row"><Link to="/">Request an ambulance</Link></div>
        </div>
      </div>
    );
  }

  if (notFound) {
    return (
      <div className="patient-wrap">
        <div className="patient-card">
          <div className="patient-panel">
            <h1>Request not found</h1>
            <p>This tracking link is invalid or has expired. If you still need help, call <strong>112</strong>.</p>
            <Link to="/">Make a new request</Link>
          </div>
        </div>
      </div>
    );
  }

  if (!view) {
    return <div className="login-wrap muted">{problem || "Loading your request…"}</div>;
  }

  const finished = TERMINAL.includes(view.status);
  const eta = formatEta(view.eta_seconds);
  const etaLabel = view.status === "transporting" ? "Time to hospital" : "Estimated arrival";

  return (
    <div className="patient-wrap">
      <div className="patient-card">
        <div className="patient-panel">
          <h2>Your request</h2>
          <span className="ref-pill">{view.reference}</span>
          <div className="status-big">{view.status_label}</div>
          {eta && (
            <div className="detail-row">
              <span className="detail-label">{etaLabel}</span>
              <span>
                {eta}
                {view.route?.source === "haversine" && <span className="muted"> (rough estimate)</span>}
              </span>
            </div>
          )}
          <Timeline status={view.status} />
          {problem && <p className="muted">{problem}</p>}
        </div>

        {view.status !== "cancelled" && (
          <div className="patient-panel">
            <TrackMap view={view} />
            <div className="legend muted">
              <span>■ You</span>
              <span>● Ambulance</span>
              <span>■ Hospital (dark)</span>
            </div>
          </div>
        )}

        <div className="patient-panel">
          {view.ambulance && (
            <div className="detail-row">
              <span className="detail-label">Ambulance</span>
              <span>{view.ambulance.number}</span>
            </div>
          )}
          {view.hospital && (
            <div className="detail-row">
              <span className="detail-label">Destination hospital</span>
              <span>{view.hospital.name}</span>
            </div>
          )}
          {lastUpdated && !finished && (
            <div className="detail-row">
              <span className="detail-label">Last updated</span>
              <span>{lastUpdated.toLocaleTimeString()}</span>
            </div>
          )}
          <button type="button" className="secondary-btn" onClick={copyLink}>
            {copied ? "Link copied" : "Copy tracking link"}
          </button>
          <p className="muted">
            Keep this link private. Anyone who has it can see this request until it expires. If things get worse, call 112.
          </p>
        </div>

        <div className="link-row">
          <Link to="/">Make another request</Link>
        </div>
      </div>
    </div>
  );
}