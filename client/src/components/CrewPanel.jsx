export default function CrewPanel({ crew }) {
  return (
    <div className="panel">
      <h2>Crew</h2>
      <ul className="list">
        {crew.length === 0 && <li className="muted">No crew records.</li>}
        {crew.map((c) => (
          <li key={c._id} className="list-item">
            <span className="dot" style={{ background: c.assigned_ambulance ? "#3b82f6" : "#22c55e" }} />
            <div className="list-item-body">
              <strong>{c.name}</strong> <span className="muted">{c.role}</span>
              <div className="badge">
                {c.assigned_ambulance ? `On ${c.assigned_ambulance.ambulance_number ?? "an ambulance"}` : "Available"}
              </div>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}