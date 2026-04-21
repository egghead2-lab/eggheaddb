const pool = require('../db/pool');

const GOOGLE_API_KEY = process.env.GOOGLE_MAPS_API_KEY;
const MAX_CACHE_DAYS = 180; // Recompute after 6 months

function buildAddress(obj) {
  if (!obj) return null;
  const parts = [];
  if (obj.address) parts.push(obj.address);
  if (obj.city_name) parts.push(obj.city_name);
  if (obj.state_code) parts.push(obj.state_code);
  if (obj.zip_code) parts.push(obj.zip_code);
  return parts.join(', ') || null;
}

async function getProfessorAddress(professorId) {
  const [[p]] = await pool.query(
    `SELECT p.address, c.city_name, s.state_code, c.zip_code
     FROM professor p
     LEFT JOIN city c ON c.id = p.city_id
     LEFT JOIN state s ON s.id = c.state_id
     WHERE p.id = ?`,
    [professorId]
  );
  return p ? buildAddress(p) : null;
}

async function getLocationAddress(locationId) {
  const [[l]] = await pool.query(
    `SELECT l.address, c.city_name, s.state_code, c.zip_code
     FROM location l
     LEFT JOIN city c ON c.id = l.city_id
     LEFT JOIN state s ON s.id = c.state_id
     WHERE l.id = ?`,
    [locationId]
  );
  return l ? buildAddress(l) : null;
}

async function callDistanceMatrix(origin, destination) {
  if (!GOOGLE_API_KEY) throw new Error('GOOGLE_MAPS_API_KEY not configured');
  if (!origin || !destination) throw new Error('Missing origin or destination address');

  // Uses Routes API (computeRoutes) — replaces legacy Distance Matrix API
  const res = await fetch('https://routes.googleapis.com/directions/v2:computeRoutes', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': GOOGLE_API_KEY,
      'X-Goog-FieldMask': 'routes.distanceMeters,routes.duration',
    },
    body: JSON.stringify({
      origin: { address: origin },
      destination: { address: destination },
      travelMode: 'DRIVE',
      routingPreference: 'TRAFFIC_UNAWARE',
    }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(`Routes API error: ${data.error?.message || res.statusText}`);
  const route = data.routes?.[0];
  if (!route) throw new Error('No route found');

  const meters = route.distanceMeters;
  const durationSec = parseInt(route.duration?.replace('s', '') || '0');
  return {
    miles: meters / 1609.344,
    minutes: Math.round(durationSec / 60),
  };
}

async function getProfessorToLocationMiles(professorId, locationId, { forceRefresh = false } = {}) {
  if (!forceRefresh) {
    const [[cached]] = await pool.query(
      'SELECT miles, duration_minutes, calculated_at FROM professor_location_distance WHERE professor_id = ? AND location_id = ?',
      [professorId, locationId]
    );
    if (cached && isFresh(cached.calculated_at)) return { miles: parseFloat(cached.miles), minutes: cached.duration_minutes, cached: true };
  }

  const origin = await getProfessorAddress(professorId);
  const destination = await getLocationAddress(locationId);
  const result = await callDistanceMatrix(origin, destination);

  await pool.query(
    `INSERT INTO professor_location_distance (professor_id, location_id, miles, duration_minutes, calculated_at)
     VALUES (?, ?, ?, ?, NOW())
     ON DUPLICATE KEY UPDATE miles = VALUES(miles), duration_minutes = VALUES(duration_minutes), calculated_at = NOW()`,
    [professorId, locationId, result.miles.toFixed(2), result.minutes]
  );
  return { ...result, cached: false };
}

async function getLocationToLocationMiles(fromLocationId, toLocationId, { forceRefresh = false } = {}) {
  if (fromLocationId === toLocationId) return { miles: 0, minutes: 0, cached: true };

  if (!forceRefresh) {
    const [[cached]] = await pool.query(
      'SELECT miles, duration_minutes, calculated_at FROM location_location_distance WHERE from_location_id = ? AND to_location_id = ?',
      [fromLocationId, toLocationId]
    );
    if (cached && isFresh(cached.calculated_at)) return { miles: parseFloat(cached.miles), minutes: cached.duration_minutes, cached: true };
  }

  const origin = await getLocationAddress(fromLocationId);
  const destination = await getLocationAddress(toLocationId);
  const result = await callDistanceMatrix(origin, destination);

  await pool.query(
    `INSERT INTO location_location_distance (from_location_id, to_location_id, miles, duration_minutes, calculated_at)
     VALUES (?, ?, ?, ?, NOW())
     ON DUPLICATE KEY UPDATE miles = VALUES(miles), duration_minutes = VALUES(duration_minutes), calculated_at = NOW()`,
    [fromLocationId, toLocationId, result.miles.toFixed(2), result.minutes]
  );
  return { ...result, cached: false };
}

function isFresh(calculated_at) {
  if (!calculated_at) return false;
  const ageDays = (Date.now() - new Date(calculated_at).getTime()) / 86400000;
  return ageDays < MAX_CACHE_DAYS;
}

module.exports = { getProfessorToLocationMiles, getLocationToLocationMiles, getProfessorAddress, getLocationAddress };
