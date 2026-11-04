import { useState } from "react";
import { reportEmergency, dispatchEmergency, confirmEmergency, rejectEmergency } from "../api";
import { emergencyColor } from "../statusColors";
import LocationSearch from "./LocationSearch";

const EMPTY_FORM = { emergency_type: "cardiac", location: "", latitude: null, longitude: null, severity: "High" };
const SEVERITIES = ["High", "Medium", "Low"];

// A request submitted through the public page, waiting for a dispatcher.
// Confirming moves it to "waiting" (the existing Dispatch button takes it
// from there); rejecting closes it. The severity selector lets the
// dispatcher correct the urgency the patient picked.
function PendingRequestItem({ emergency, onReviewed }) {
  const [severity, setSeverity] = useState(emergency.severity);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const act = async (action) => {
    setBusy(true);
    setError(null);
    try {
      await action();
      onReviewed();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <li className="list-item pending-item">
      <span className="dot" style={{ background: emergencyColor(severity) }} />
      <div className="list-item-body">
        <div>
          <span className="new-badge">Patient request</span> <strong>{emergency.emergency_type}</strong>
        </div>
        <div>{emergency.location}</div>
        {emergency.reference && <div className="muted">Ref {emergency.reference}</div>}
        <div className="muted">
          {emergency.contact_name ? `${emergency.contact_name} · ` : ""}
          {emergency.contact_phone ? (
            <a href={`tel:${emergency.contact_phone}`}>{emergency.contact_phone}</a>
          ) : (
            "no phone on record"
          )}
        </div>
        {emergency.detail && <div className="muted">“{emergency.detail}”</div>}
        <div className="pending-actions">
          <select value={severity} onChange={(e) => setSeverity(e.target.value)} disabled={busy}>
            {SEVERITIES.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
          <button disabled={busy} onClick={() => act(() => confirmEmergency(emergency._id, severity))}>
            Confirm
          </button>
          <button className="danger-outline" disabled={busy} onClick={() => act(() => rejectEmergency(emergency._id))}>
            Reject
          </button>
        </div>
        {error && <p className="error">{error}</p>}
      </div>
    </li>
  );
}

export default function EmergencyPanel({
  emergencies,
  closedCount,
  showClosed,
  onToggleClosed,
  onReported,
  onReviewed,
  onDispatched,
}) {
  const [form, setForm] = useState(EMPTY_FORM);
  const [dispatchingId, setDispatchingId] = useState(null);
  const [error, setError] = useState(null);
  const [searchKey, setSearchKey] = useState(0);

  const handleLocationSelect = ({ location, latitude, longitude }) => {
    setForm((f) => ({ ...f, location, latitude, longitude }));
  };

  const isValid = form.location !== "" && form.latitude != null && form.longitude != null;

  const submit = async (e) => {
    e.preventDefault();
    setError(null);
    try {
      await reportEmergency(form);
      onReported();
      setForm(EMPTY_FORM);
      setSearchKey((k) => k + 1);
    } catch (err) {
      setError(err.message);
    }
  };

  const handleDispatch = async (id) => {
    setDispatchingId(id);
    setError(null);
    try {
      const result = await dispatchEmergency(id);
      onDispatched(result);
    } catch (err) {
      setError(err.message);
    } finally {
      setDispatchingId(null);
    }
  };

  return (
    <div className="panel">
      <h2>Report Emergency</h2>
      <form onSubmit={submit} className="form">
        <select value={form.emergency_type} onChange={(e) => setForm({ ...form, emergency_type: e.target.value })}>
          <option value="cardiac">Cardiac</option>
          <option value="trauma">Trauma</option>
          <option value="general">General</option>
        </select>

        <LocationSearch key={searchKey} onSelect={handleLocationSelect} />

        <select value={form.severity} onChange={(e) => setForm({ ...form, severity: e.target.value })}>
          <option value="High">High</option>
          <option value="Medium">Medium</option>
          <option value="Low">Low</option>
        </select>
        <button type="submit" disabled={!isValid}>Report Emergency</button>
      </form>
      {error && <p className="error">{error}</p>}

      <h2>Emergencies</h2>
      <label className="toggle-row">
        <input type="checkbox" checked={showClosed} onChange={(e) => onToggleClosed(e.target.checked)} />
        Show closed ({closedCount})
      </label>
      <ul className="list">
        {emergencies.length === 0 && <li className="muted">No active emergencies.</li>}
        {emergencies.map((e) =>
          e.status === "pendingReview" ? (
            <PendingRequestItem key={e._id} emergency={e} onReviewed={onReviewed} />
          ) : (
            <li key={e._id} className="list-item">
              <span className="dot" style={{ background: emergencyColor(e.severity) }} />
              <div className="list-item-body">
                <strong>{e.emergency_type}</strong> — {e.location}
                <div className="badge">{e.status}</div>
              </div>
              {e.status === "waiting" && (
                <button disabled={dispatchingId === e._id} onClick={() => handleDispatch(e._id)}>
                  {dispatchingId === e._id ? "…" : "Dispatch"}
                </button>
              )}
            </li>
          )
        )}
      </ul>
    </div>
  );
}