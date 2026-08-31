import { useState } from "react";
import { reportEmergency, dispatchEmergency } from "../api";
import { emergencyColor } from "../statusColors";
import LocationSearch from "./LocationSearch";

const EMPTY_FORM = { emergency_type: "cardiac", location: "", latitude: null, longitude: null, severity: "High" };

export default function EmergencyPanel({ emergencies, onReported, onDispatched }) {
  const [form, setForm] = useState(EMPTY_FORM);
  const [dispatchingId, setDispatchingId] = useState(null);
  const [error, setError] = useState(null);
  const [searchKey, setSearchKey] = useState(0); // forces LocationSearch to reset after submit

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
      setSearchKey((k) => k + 1); // remounts LocationSearch, clearing its internal state too
    } catch (err) {
      setError(err.message);
    }
  };

  const handleDispatch = async (id) => {
    setDispatchingId(id);
    setError(null);
    try {
      await dispatchEmergency(id);
      onDispatched();
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
      <ul className="list">
        {emergencies.map((e) => (
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
        ))}
      </ul>
    </div>
  );
}