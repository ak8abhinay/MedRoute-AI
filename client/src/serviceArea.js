// Same box as the server's constants/serviceArea.js and LocationSearch's
// Nominatim bounds: the area the loaded OSRM extract actually covers. The
// client check only gives early, friendly feedback - the server enforces it.
export const SERVICE_AREA = { west: 78.235, south: 17.204, east: 78.682, north: 17.606 };

export const isInServiceArea = (latitude, longitude) =>
  latitude >= SERVICE_AREA.south &&
  latitude <= SERVICE_AREA.north &&
  longitude >= SERVICE_AREA.west &&
  longitude <= SERVICE_AREA.east;