const API_BASE = import.meta.env.VITE_API_BASE || "http://localhost:5000";

export const getAmbulances = () => fetch(`${API_BASE}/api/ambulances`).then((r) => r.json());
export const getEmergencies = () => fetch(`${API_BASE}/api/emergencies`).then((r) => r.json());
export const getHospitals = () => fetch(`${API_BASE}/api/hospitals`).then((r) => r.json());

export const reportEmergency = (data) =>
  fetch(`${API_BASE}/api/emergencies`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  }).then((r) => r.json());

export const dispatchEmergency = async (id) => {
  const res = await fetch(`${API_BASE}/api/dispatch/${id}`, { method: "POST" });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Dispatch failed");
  return data;
};