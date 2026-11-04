// The box the loaded OSRM extract actually covers (the header bbox from
// `osmium fileinfo -e` on the BBBike file). The client's place search
// uses the same numbers, but only the server can enforce them against a
// direct API call.
export const SERVICE_AREA = { west: 78.235, south: 17.204, east: 78.682, north: 17.606 };

export const isInServiceArea = (latitude, longitude) =>
  latitude >= SERVICE_AREA.south &&
  latitude <= SERVICE_AREA.north &&
  longitude >= SERVICE_AREA.west &&
  longitude <= SERVICE_AREA.east;