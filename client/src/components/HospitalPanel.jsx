const STATUS_COLOR = { operational: "#22c55e", full: "#f59e0b", closed: "#ef4444" };

export default function HospitalPanel({ hospitals }) {
  return (
    <div className="panel">
      <h2>Hospitals</h2>
      <ul className="list">
        {hospitals.length === 0 && <li className="muted">No hospitals.</li>}
        {hospitals.map((h) => (
          <li key={h._id} className="list-item">
            <span className="dot" style={{ background: STATUS_COLOR[h.status] || "#6b7280" }} />
            <div className="list-item-body">
              <strong>{h.name}</strong>
              <div className="badge">
                {h.status} · beds {h.available_beds}/{h.total_beds}
                {h.has_icu ? " · ICU" : ""}
              </div>
              <div className="muted">{h.specialties?.join(", ") || "no specialties listed"}</div>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}