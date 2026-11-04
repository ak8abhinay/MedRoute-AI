import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import LocationSearch from "./LocationSearch";
import { createPublicRequest } from "../publicApi";
import { saveRequest } from "../patientSession";
import { isInServiceArea } from "../serviceArea";

const TYPE_OPTIONS = [
  { value: "cardiac", label: "Chest pain / heart problem" },
  { value: "trauma", label: "Injury or accident" },
  { value: "general", label: "Other medical emergency" },
];

const URGENCY_OPTIONS = [
  { value: "life_threatening", label: "Life-threatening (unconscious, not breathing, severe bleeding)" },
  { value: "serious", label: "Serious (needs urgent help)" },
  { value: "not_life_threatening", label: "Not life-threatening" },
];

export default function RequestPage() {
  const navigate = useNavigate();

  const [emergencyType, setEmergencyType] = useState("cardiac");
  const [urgency, setUrgency] = useState(""); // must be chosen explicitly
  const [place, setPlace] = useState(null); // { location, latitude, longitude, source }
  const [searchKey, setSearchKey] = useState(0);
  const [contactName, setContactName] = useState("");
  const [phone, setPhone] = useState("");
  const [detail, setDetail] = useState("");
  const [honeypot, setHoneypot] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const [geoBusy, setGeoBusy] = useState(false);
  const [geoError, setGeoError] = useState(null);

  const handleSearchSelect = ({ location, latitude, longitude }) => {
    setPlace({ location, latitude, longitude, source: "search" });
    setGeoError(null);
  };

  const useMyLocation = () => {
    if (!navigator.geolocation) {
      setGeoError("Your browser can't share your location. Search for a place instead.");
      return;
    }
    setGeoBusy(true);
    setGeoError(null);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const { latitude, longitude } = pos.coords;
        setGeoBusy(false);
        if (!isInServiceArea(latitude, longitude)) {
          setGeoError("Your location is outside our service area (Hyderabad). If this is an emergency, call 112.");
          return;
        }
        setPlace({
          location: `My current location (${latitude.toFixed(5)}, ${longitude.toFixed(5)})`,
          latitude,
          longitude,
          source: "gps",
        });
        setSearchKey((k) => k + 1); // clears the search box's own "Selected" line
      },
      (err) => {
        setGeoBusy(false);
        setGeoError(
          err.code === 1
            ? "Location permission was denied. Search for a place instead."
            : "Couldn't get your location. Search for a place instead."
        );
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  };

  const canSubmit = !!place && !!urgency && phone.trim().length >= 7 && !submitting;

  const submit = async (e) => {
    e.preventDefault();
    if (!canSubmit) return;
    setSubmitting(true);
    setError(null);
    try {
      const data = await createPublicRequest({
        emergency_type: emergencyType,
        urgency,
        // The server caps the label at 200 characters; long Nominatim
        // labels would otherwise be rejected.
        location: place.location.slice(0, 200),
        latitude: place.latitude,
        longitude: place.longitude,
        contact_name: contactName.trim() || undefined,
        contact_phone: phone.trim(),
        detail: detail.trim() || undefined,
        website: honeypot,
      });
      saveRequest({ token: data.tracking_token, reference: data.reference });
      navigate(`/track#${data.tracking_token}`);
    } catch (err) {
      setError(err.message);
      setSubmitting(false);
    }
  };

  return (
    <div className="patient-wrap">
      <div className="patient-card">
        <div className="notice">
          <strong>In a real emergency, call 112.</strong> This is a demonstration project and is not connected to real
          emergency services.
        </div>

        <form className="patient-panel patient-form" onSubmit={submit}>
          <h1>Request an ambulance</h1>

          <div>
            <label className="field-label">What is happening?</label>
            <select value={emergencyType} onChange={(e) => setEmergencyType(e.target.value)}>
              {TYPE_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </div>

          <fieldset className="radio-group">
            <legend className="field-label">How urgent is it?</legend>
            {URGENCY_OPTIONS.map((o) => (
              <label key={o.value} className="radio-row">
                <input type="radio" name="urgency" value={o.value} checked={urgency === o.value} onChange={() => setUrgency(o.value)} />
                {o.label}
              </label>
            ))}
          </fieldset>

          <div>
            <label className="field-label">Where is the patient?</label>
            <LocationSearch key={searchKey} onSelect={handleSearchSelect} />
            <button type="button" className="secondary-btn" onClick={useMyLocation} disabled={geoBusy}>
              {geoBusy ? "Finding you…" : "Use my current location"}
            </button>
            {geoError && <p className="error">{geoError}</p>}
            {place?.source === "gps" && <p className="ok-text">Using: {place.location}</p>}
          </div>

          <div>
            <label className="field-label">Contact phone (required)</label>
            <input
              type="tel"
              inputMode="tel"
              autoComplete="tel"
              maxLength={25}
              placeholder="+91 98765 43210"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              required
            />
          </div>

          <div>
            <label className="field-label">Your name (optional)</label>
            <input type="text" maxLength={80} autoComplete="name" value={contactName} onChange={(e) => setContactName(e.target.value)} />
          </div>

          <div>
            <label className="field-label">Anything else we should know? (optional)</label>
            <textarea rows={3} maxLength={500} value={detail} onChange={(e) => setDetail(e.target.value)} />
          </div>

          {/* Honeypot: invisible to people, tempting to bots. */}
          <input
            type="text"
            name="website"
            className="hp-field"
            tabIndex={-1}
            autoComplete="off"
            aria-hidden="true"
            value={honeypot}
            onChange={(e) => setHoneypot(e.target.value)}
          />

          {error && <p className="error">{error}</p>}

          <button type="submit" className="primary-btn" disabled={!canSubmit}>
            {submitting ? "Sending…" : "Request ambulance"}
          </button>
          <p className="muted">
            A dispatcher reviews each request before an ambulance is sent. You'll get a private link to follow its progress.
          </p>
        </form>

        <div className="link-row">
          <Link to="/track">Track an existing request</Link>
          <Link to="/staff/login">Staff login</Link>
        </div>
      </div>
    </div>
  );
}