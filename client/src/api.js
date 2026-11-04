import { getToken, clearToken, notifyUnauthorized } from "./auth";

const API_BASE = import.meta.env.VITE_API_BASE || "http://localhost:5000";

// Every call to OUR backend goes through here and carries the token.
// Calls to third parties (Nominatim in LocationSearch) deliberately do
// not - the staff token must never be sent anywhere else.
const request = async (path, options = {}) => {
  const token = getToken();
  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options.headers || {}),
    },
  });

  let data = null;
  try {
    data = await res.json();
  } catch {
    /* empty or non-JSON body */
  }

  // An expired/invalid token anywhere means back to the login screen. A
  // wrong password on the login call itself is not a dead session.
  if (res.status === 401 && path !== "/api/auth/login") {
    clearToken();
    notifyUnauthorized();
  }

  if (!res.ok) throw new Error(data?.error || `Request failed (${res.status})`);
  return data;
};

export const login = (email, password) =>
  request("/api/auth/login", { method: "POST", body: JSON.stringify({ email, password }) });
export const getMe = () => request("/api/auth/me");

export const getAmbulances = () => request("/api/ambulances");
export const getEmergencies = () => request("/api/emergencies");
export const getHospitals = () => request("/api/hospitals");

export const reportEmergency = (data) =>
  request("/api/emergencies", { method: "POST", body: JSON.stringify(data) });

// Returns the full dispatch result (scores, sources, ETA, crew, hospital).
// Nothing displays it yet - the decision card in Step 3 will.
export const dispatchEmergency = (id) => request(`/api/dispatch/${id}`, { method: "POST" });
export const getCrew = () => request("/api/crew");

export const confirmEmergency = (id, severity) =>
  request(`/api/emergencies/${id}/confirm`, { method: "POST", body: JSON.stringify(severity ? { severity } : {}) });

export const rejectEmergency = (id) => request(`/api/emergencies/${id}/reject`, { method: "POST" });
