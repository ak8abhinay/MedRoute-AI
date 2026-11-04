const formatEta = (seconds) => {
  if (!seconds) return "Unknown";
  const total = Math.round(seconds);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
};

const ROUTE_LABEL = {
  osrm: "Road network (OSRM)",
  haversine: "Straight-line estimate (fallback)",
};

const SOURCE_HINT = {
  ml: "V1 ML model, trained to approximate the rule-based scorer on synthetic data. Not yet trained on real dispatch outcomes.",
  rule: "Rule-based formula, used when the ML service is unavailable.",
  "rule-straightline": "Rule-based formula on straight-line distance (outside the routed shortlist).",
};

function SourceBadge({ source }) {
  if (!source) return null;
  const isMl = source === "ml";
  return (
    <span className={`source-badge ${isMl ? "source-ml" : "source-rule"}`} title={SOURCE_HINT[source]}>
      {isMl ? "ML" : "Rule"}
    </span>
  );
}

export default function DispatchResultCard({ result, onClose }) {
  const { ambulance, crew, hospital } = result;

  return (
    <div className="result-card">
      <div className="result-header">
        <strong>Dispatch decision</strong>
        <button onClick={onClose} aria-label="Dismiss">×</button>
      </div>

      <div className="result-row">
        <span className="result-label">Ambulance</span>
        <span>
          <strong>{ambulance?.ambulance_number}</strong> <SourceBadge source={result.scoreSource} />{" "}
          {result.score != null && <span className="muted">score {result.score.toFixed(1)}</span>}
        </span>
      </div>

      <div className="result-row">
        <span className="result-label">ETA</span>
        <span>
          {formatEta(result.etaSeconds)}{" "}
          <span className="muted">· {ROUTE_LABEL[result.routeSource] || "No route data"}</span>
        </span>
      </div>

      <div className="result-row">
        <span className="result-label">Crew</span>
        <span>{crew ? `${crew.name} (${crew.role})` : "None assigned"}</span>
      </div>

      <div className="result-row">
        <span className="result-label">Hospital</span>
        <span>
          {hospital ? (
            <>
              <strong>{hospital.name}</strong> <SourceBadge source={result.hospitalScoreSource} />{" "}
              {result.hospitalScore != null && <span className="muted">score {result.hospitalScore.toFixed(1)}</span>}
            </>
          ) : (
            "None available yet (retried automatically after on-scene time)"
          )}
        </span>
      </div>
    </div>
  );
}