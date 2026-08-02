/**
 *  Haversine formula: straight-line ("as the crow flies") distance
 * between two lat/lng points on Earth's surface, in meters.
 * Returns the straight-line distance between two latitude/longitude
 * coordinates using the Haversine formula.
 *
 * Used for proximity checks such as determining whether an ambulance
 * has reached an emergency location.
 */

export const calculateDistance = (lat1, lon1, lat2, lon2) => {
  const EARTH_RADIUS_METERS = 6371000;
  const toRadians = (degrees) => (degrees * Math.PI) / 180;

  const deltaLat = toRadians(lat2 - lat1);
  const deltaLon = toRadians(lon2 - lon1);

  const a =
    Math.sin(deltaLat / 2) ** 2 +
    Math.cos(toRadians(lat1)) * Math.cos(toRadians(lat2)) * Math.sin(deltaLon / 2) ** 2;

  const centralAngle = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return EARTH_RADIUS_METERS * centralAngle;
};