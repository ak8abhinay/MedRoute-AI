import { useEffect, useState, useCallback, useMemo } from "react";
import MapView from "./MapView";
import AmbulancePanel from "./AmbulancePanel";
import EmergencyPanel from "./EmergencyPanel";
import CrewPanel from "./CrewPanel";
import HospitalPanel from "./HospitalPanel";
import DispatchResultCard from "./DispatchResultCard";
import { getAmbulances, getEmergencies, getHospitals, getCrew } from "../api";
import { socket } from "../socket";

const CLOSED = ["resolved", "cancelled"];
// Patient requests awaiting review float to the top; everything else is newest first.
const rank = (e) => (e.status === "pendingReview" ? 0 : 1);

const logLoadError = (label) => (err) => console.error(`Failed to load ${label}:`, err.message);

export default function StaffDashboard({ user, onLogout }) {
  const [ambulances, setAmbulances] = useState([]);
  const [emergencies, setEmergencies] = useState([]);
  const [hospitals, setHospitals] = useState([]);
  const [crew, setCrew] = useState([]);
  const [lastDispatch, setLastDispatch] = useState(null);
  const [showClosed, setShowClosed] = useState(false);

  const refreshAmbulances = useCallback(() => getAmbulances().then(setAmbulances).catch(logLoadError("ambulances")), []);
  const refreshEmergencies = useCallback(() => getEmergencies().then(setEmergencies).catch(logLoadError("emergencies")), []);
  const refreshCrew = useCallback(() => getCrew().then(setCrew).catch(logLoadError("crew")), []);

  useEffect(() => {
    refreshAmbulances();
    refreshEmergencies();
    refreshCrew();
    getHospitals().then(setHospitals).catch(logLoadError("hospitals"));

    // GPS ticks arrive constantly while an ambulance drives - patch just
    // that ambulance in place instead of refetching the whole list.
    const onGpsUpdate = ({ ambulanceId, latitude, longitude }) => {
      setAmbulances((prev) => prev.map((a) => (a._id === ambulanceId ? { ...a, latitude, longitude } : a)));
    };
    // Everything else touches enough fields (and populated relations,
    // including crew assignment) that a refetch is simpler and safe at
    // this scale. emergency:created is a new patient request arriving.
    const onNeedsRefresh = () => {
      refreshAmbulances();
      refreshEmergencies();
      refreshCrew();
    };
    // The server rejects the handshake with "Authentication required."
    // when the token is missing, invalid or expired. Other connect errors
    // (network down) are ignored - socket.io retries those itself.
    const onConnectError = (err) => {
      if (/authentication/i.test(err.message)) onLogout();
    };

    socket.on("ambulance:gps-update", onGpsUpdate);
    socket.on("ambulance:status-change", onNeedsRefresh);
    socket.on("ambulance:crew-assigned", onNeedsRefresh);
    socket.on("emergency:created", onNeedsRefresh);
    socket.on("emergency:dispatched", onNeedsRefresh);
    socket.on("emergency:status-change", onNeedsRefresh);
    socket.on("emergency:resolved", onNeedsRefresh);
    socket.on("hospital:assigned", onNeedsRefresh);
    socket.on("connect_error", onConnectError);
    socket.connect();

    return () => {
      socket.off("ambulance:gps-update", onGpsUpdate);
      socket.off("ambulance:status-change", onNeedsRefresh);
      socket.off("ambulance:crew-assigned", onNeedsRefresh);
      socket.off("emergency:created", onNeedsRefresh);
      socket.off("emergency:dispatched", onNeedsRefresh);
      socket.off("emergency:status-change", onNeedsRefresh);
      socket.off("emergency:resolved", onNeedsRefresh);
      socket.off("hospital:assigned", onNeedsRefresh);
      socket.off("connect_error", onConnectError);
      socket.disconnect();
    };
  }, [refreshAmbulances, refreshEmergencies, refreshCrew, onLogout]);

  const pendingCount = emergencies.filter((e) => e.status === "pendingReview").length;
  const closedCount = emergencies.filter((e) => CLOSED.includes(e.status)).length;

  const visibleEmergencies = useMemo(
    () =>
      [...emergencies]
        .filter((e) => showClosed || !CLOSED.includes(e.status))
        .sort((a, b) => rank(a) - rank(b) || new Date(b.createdAt) - new Date(a.createdAt)),
    [emergencies, showClosed]
  );

  return (
    <div className="app">
      <div className="sidebar">
        <div className="userbar">
          <div>
            <strong>{user.name}</strong>
            <div className="badge">{user.role}</div>
          </div>
          <button onClick={onLogout}>Log out</button>
        </div>

        {pendingCount > 0 && (
          <div className="pending-banner">
            {pendingCount} patient request{pendingCount === 1 ? "" : "s"} awaiting review
          </div>
        )}

        {lastDispatch && <DispatchResultCard result={lastDispatch} onClose={() => setLastDispatch(null)} />}

        <EmergencyPanel
          emergencies={visibleEmergencies}
          closedCount={closedCount}
          showClosed={showClosed}
          onToggleClosed={setShowClosed}
          onReported={refreshEmergencies}
          onReviewed={refreshEmergencies}
          onDispatched={(result) => {
            setLastDispatch(result);
            refreshAmbulances();
            refreshEmergencies();
            refreshCrew();
          }}
        />
        <AmbulancePanel ambulances={ambulances} />
        <CrewPanel crew={crew} />
        <HospitalPanel hospitals={hospitals} />
      </div>
      <div className="map">
        <MapView ambulances={ambulances} emergencies={emergencies} hospitals={hospitals} />
      </div>
    </div>
  );
}