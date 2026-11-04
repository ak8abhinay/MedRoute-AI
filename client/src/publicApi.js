const API_BASE = import.meta.env.VITE_API_BASE || "http://localhost:5000";

// Deliberately independent of auth.js and api.js: the patient side never
// reads, sends or clears the staff token, even if a dispatcher happens
// to be logged in on the same browser.

const readJson = async (res) => {
  try {
    return await res.json();
  } catch {
    return null;
  }
};

export const createPublicRequest = async (payload) => {
  let res;
  try {
    res = await fetch(`${API_BASE}/api/public/requests`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
  } catch {
    throw new Error("Could not reach the server. If this is an emergency, call 112.");
  }
  const data = await readJson(res);
  if (!res.ok) {
    throw new Error(data?.error || `Could not submit the request (${res.status}). If this is an emergency, call 112.`);
  }
  return data;
};

// The token goes in a header, not the URL, so it stays out of server logs.
// A network failure throws a plain error with no `code`.
export const fetchTracking = async (token) => {
  const res = await fetch(`${API_BASE}/api/public/track`, {
    headers: { "x-tracking-token": token },
    cache: "no-store",
  });
  const data = await readJson(res);
  if (res.ok) return data;

  const err = new Error(data?.error || `Request failed (${res.status})`);
  err.code = res.status === 404 ? "NOT_FOUND" : res.status === 429 ? "RATE_LIMITED" : "ERROR";
  throw err;
};