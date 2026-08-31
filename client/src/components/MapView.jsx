import { MapContainer, TileLayer, Marker, Popup } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { ambulanceColor, emergencyColor } from "../statusColors";

// Central Hyderabad - matches the coordinates used throughout this
// project's own testing (City General, the BBBike extract's coverage).
const HYDERABAD_CENTER = [17.385, 78.4867];

// Deliberately NOT using Leaflet's default L.Icon here - its default
// marker image paths are a well-known pain point with bundlers like Vite
// (the images don't resolve correctly without extra config). A plain
// divIcon sidesteps that entirely - no image assets needed at all.
const divIcon = (color, shape = "circle") =>
  L.divIcon({
    className: "",
    html: `<div style="background:${color};width:16px;height:16px;border-radius:${
      shape === "circle" ? "50%" : "3px"
    };border:2px solid white;box-shadow:0 0 4px rgba(0,0,0,.5);"></div>`,
    iconSize: [16, 16],
    iconAnchor: [8, 8],
  });

export default function MapView({ ambulances, emergencies, hospitals }) {
  return (
    <MapContainer center={HYDERABAD_CENTER} zoom={13} style={{ height: "100%", width: "100%" }}>
      <TileLayer
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
      />

      {ambulances
        .filter((a) => a.latitude != null && a.longitude != null)
        .map((a) => (
          <Marker key={a._id} position={[a.latitude, a.longitude]} icon={divIcon(ambulanceColor(a.status), "circle")}>
            <Popup>
              <strong>{a.ambulance_number}</strong>
              <br />
              Status: {a.status}
            </Popup>
          </Marker>
        ))}

      {emergencies
        .filter((e) => e.status !== "resolved")
        .map((e) => (
          <Marker key={e._id} position={[e.latitude, e.longitude]} icon={divIcon(emergencyColor(e.severity), "square")}>
            <Popup>
              <strong>{e.emergency_type}</strong> ({e.severity})
              <br />
              {e.location}
              <br />
              Status: {e.status}
            </Popup>
          </Marker>
        ))}

      {hospitals.map((h) => (
        <Marker key={h._id} position={[h.latitude, h.longitude]} icon={divIcon("#1f2937", "square")}>
          <Popup>
            <strong>{h.name}</strong>
            <br />
            Beds: {h.available_beds}/{h.total_beds}
          </Popup>
        </Marker>
      ))}
    </MapContainer>
  );
}