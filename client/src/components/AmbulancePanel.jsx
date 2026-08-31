import { ambulanceColor } from "../statusColors";

export default function AmbulancePanel({ ambulances }) {
  return (
    <div className="panel">
      <h2>Ambulances</h2>
      <ul className="list">
        {ambulances.map((a) => (
          <li key={a._id} className="list-item">
            <span className="dot" style={{ background: ambulanceColor(a.status) }} />
            <div className="list-item-body">
              <strong>{a.ambulance_number}</strong>
              <div className="badge">{a.status}</div>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}