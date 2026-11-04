import { useEffect, useRef } from "react";
import { MapContainer, TileLayer, Marker, Popup, Polyline, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

const divIcon = (color, shape = "circle") =>
  L.divIcon({
    className: "",
    html: `<div style="background:${color};width:18px;height:18px;border-radius:${
      shape === "circle" ? "50%" : "3px"
    };border:2px solid white;box-shadow:0 0 4px rgba(0,0,0,.5);"></div>`,
    iconSize: [18, 18],
    iconAnchor: [9, 9],
  });

// Re-fit the view only when the set of known points GROWS (you only ->
// plus the ambulance -> plus the hospital). Re-fitting on every 5-second
// update would fight a patient who is panning or zooming.
function FitToPoints({ points }) {
  const map = useMap();
  const fittedCount = useRef(0);

  useEffect(() => {
    if (points.length <= fittedCount.current) return;
    if (points.length === 1) map.setView(points[0], 15);
    else map.fitBounds(points, { padding: [40, 40], maxZoom: 16 });
    fittedCount.current = points.length;
  }, [points, map]);

  return null;
}

export default function TrackMap({ view }) {
  const patient = [view.patient_location.latitude, view.patient_location.longitude];
  const ambulance =
    view.ambulance && view.ambulance.latitude != null && view.ambulance.longitude != null
      ? [view.ambulance.latitude, view.ambulance.longitude]
      : null;
  const hospital = view.hospital ? [view.hospital.latitude, view.hospital.longitude] : null;

  const points = [patient, ...(ambulance ? [ambulance] : []), ...(hospital ? [hospital] : [])];
  const routePoints = view.route?.points;

  return (
    <MapContainer center={patient} zoom={15} className="track-map">
      <TileLayer
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
      />
      <FitToPoints points={points} />

      {routePoints && routePoints.length > 1 && (
        <Polyline
          positions={routePoints}
          pathOptions={{
            color: "#2563eb",
            weight: 5,
            opacity: 0.8,
            dashArray: view.route.source === "haversine" ? "8 8" : undefined,
          }}
        />
      )}

      <Marker position={patient} icon={divIcon("#dc2626", "square")}>
        <Popup>Your location</Popup>
      </Marker>

      {ambulance && (
        <Marker position={ambulance} icon={divIcon("#2563eb", "circle")}>
          <Popup>Ambulance {view.ambulance.number}</Popup>
        </Marker>
      )}

      {hospital && (
        <Marker position={hospital} icon={divIcon("#1f2937", "square")}>
          <Popup>{view.hospital.name}</Popup>
        </Marker>
      )}
    </MapContainer>
  );
}