import { useState } from "react";

// Real bounds from the extract's own header (osmium fileinfo -e), NOT the
// much larger "data" bbox - that one includes outlier nodes pulled in by
// distant ways/relations, not actual routable coverage. This is the box
// that was actually drawn when the extract was requested.
const WEST = 78.235;
const SOUTH = 17.204;
const EAST = 78.682;
const NORTH = 17.606;

// Nominatim's viewbox format: left,top,right,bottom = min_lon,max_lat,max_lon,min_lat
const VIEWBOX = `${WEST},${NORTH},${EAST},${SOUTH}`;

export default function LocationSearch({ onSelect }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [selectedLabel, setSelectedLabel] = useState(null);

  const runSearch = async (e) => {
    e.preventDefault();
    if (!query.trim()) return;

    setLoading(true);
    setError(null);
    setResults([]);
    setSelectedLabel(null);

    try {
      const url =
        `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}` +
        `&viewbox=${VIEWBOX}&bounded=1&limit=5`;

      // Only fired on explicit Search click, never on keystroke - keeps
      // this a light, occasional load on the public Nominatim instance,
      // per its usage policy.
      const res = await fetch(url);
      const data = await res.json();

      if (data.length === 0) {
        setError("No matches inside the supported service area. Try a more specific or different place name.");
      }
      setResults(data);
    } catch (err) {
      setError("Search failed - " + err.message);
    } finally {
      setLoading(false);
    }
  };

  const selectResult = (result) => {
    // The one place location/lat/lng ever get set - all three come from
    // this single click, on this single result. There is no other path
    // in this component that can set any of them independently.
    setSelectedLabel(result.display_name);
    setResults([]);
    onSelect({
      location: result.display_name,
      latitude: parseFloat(result.lat),
      longitude: parseFloat(result.lon),
    });
  };

  return (
    <div className="location-search">
      <div className="form" style={{ flexDirection: "row", gap: "6px" }}>
        <input
          placeholder="Search a place (e.g. Gachibowli flyover)"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          style={{ flex: 1 }}
        />
        <button type="button" onClick={runSearch} disabled={loading}>
          {loading ? "…" : "Search"}
        </button>
      </div>

      {error && <p className="error">{error}</p>}

      {results.length > 0 && (
        <ul className="list" style={{ marginTop: "6px" }}>
          {results.map((r) => (
            <li key={r.place_id} className="list-item" style={{ cursor: "pointer" }} onClick={() => selectResult(r)}>
              <div className="list-item-body">{r.display_name}</div>
            </li>
          ))}
        </ul>
      )}

      {selectedLabel && (
        <p style={{ fontSize: "12px", color: "#16a34a", marginTop: "4px" }}>Selected: {selectedLabel}</p>
      )}
    </div>
  );
}