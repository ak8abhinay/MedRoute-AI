import { useEffect, useState, useCallback } from "react";
import MapView from "./components/MapView";
import AmbulancePanel from "./components/AmbulancePanel";
import EmergencyPanel from "./components/EmergencyPanel";
import { getAmbulances, getEmergencies, getHospitals } from "./api";
import { socket } from "./socket";
import "./index.css";

export default function App() {
  const [ambulances, setAmbulances] = useState([]);
  const [emergencies, setEmergencies] = useState([]);
  const [hospitals, setHospitals] = useState([]);

  const refreshAmbulances = useCallback(() => getAmbulances().then(setAmbulances), []);
  const refreshEmergencies = useCallback(() => getEmergencies().then(setEmergencies), []);

  useEffect(() => {
    refreshAmbulances();
    refreshEmergencies();
    getHospitals().then(setHospitals);
  }, [refreshAmbulances, refreshEmergencies]);

  useEffect(() => {
    // GPS ticks arrive constantly while an ambulance is driving - patch
    // just that one ambulance's position in place rather than refetching
    // the whole list every 3 seconds.
    const onGpsUpdate = ({ ambulanceId, latitude, longitude }) => {
      setAmbulances((prev) => prev.map((a) => (a._id === ambulanceId ? { ...a, latitude, longitude } : a)));
    };

    // Everything else (status changes, crew/hospital assignment, dispatch,
    // resolution) touches enough fields - and sometimes populated
    // relations - that a light refetch is simpler and safe at this scale,
    // rather than hand-patching every possible field combination.
    const onNeedsRefresh = () => {
      refreshAmbulances();
      refreshEmergencies();
    };

    socket.on("ambulance:gps-update", onGpsUpdate);
    socket.on("ambulance:status-change", onNeedsRefresh);
    socket.on("ambulance:crew-assigned", onNeedsRefresh);
    socket.on("emergency:dispatched", onNeedsRefresh);
    socket.on("emergency:status-change", onNeedsRefresh);
    socket.on("emergency:resolved", onNeedsRefresh);
    socket.on("hospital:assigned", onNeedsRefresh);

    return () => {
      socket.off("ambulance:gps-update", onGpsUpdate);
      socket.off("ambulance:status-change", onNeedsRefresh);
      socket.off("ambulance:crew-assigned", onNeedsRefresh);
      socket.off("emergency:dispatched", onNeedsRefresh);
      socket.off("emergency:status-change", onNeedsRefresh);
      socket.off("emergency:resolved", onNeedsRefresh);
      socket.off("hospital:assigned", onNeedsRefresh);
    };
  }, [refreshAmbulances, refreshEmergencies]);

  return (
    <div className="app">
      <div className="sidebar">
        <EmergencyPanel
          emergencies={emergencies}
          onReported={refreshEmergencies}
          onDispatched={() => {
            refreshAmbulances();
            refreshEmergencies();
          }}
        />
        <AmbulancePanel ambulances={ambulances} />
      </div>
      <div className="map">
        <MapView ambulances={ambulances} emergencies={emergencies} hospitals={hospitals} />
      </div>
    </div>
  );
}