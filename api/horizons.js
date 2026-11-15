const API = 'https://ssd.jpl.nasa.gov/api/horizons.api';
export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
  const q = req.query;
  const lat = Number(q.lat ?? -89.5); const lon = Number(q.lon ?? 0); const alt = Number(q.alt ?? 0);
  const start = String(q.start ?? '2026-12-01 00:00'); const stop = String(q.stop ?? '2026-12-02 00:00');
  if (![lat, lon, alt].every(Number.isFinite) || lat < -90 || lat > 90 || lon < -360 || lon > 360) return res.status(400).json({ error: 'Observer coordinates are invalid' });
  if (!/^\d{4}-\d\d-\d\d \d\d:\d\d$/.test(start) || !/^\d{4}-\d\d-\d\d \d\d:\d\d$/.test(stop)) return res.status(400).json({ error: 'Use date format YYYY-MM-DD HH:mm' });
  async function get(target) {
    const params = new URLSearchParams({ format:'json', COMMAND:`'${target}'`, OBJ_DATA:'NO', MAKE_EPHEM:'YES', EPHEM_TYPE:'OBSERVER', CENTER:'coord@301', COORD_TYPE:'GEODETIC', SITE_COORD:`'${lon},${lat},${alt}'`, START_TIME:`'${start}'`, STOP_TIME:`'${stop}'`, STEP_SIZE:"'1h'", QUANTITIES:"'4'", ANG_FORMAT:'DEG', CSV_FORMAT:'YES' });
    const response = await fetch(`${API}?${params}`, { signal: AbortSignal.timeout(25_000) });
    if (!response.ok) throw new Error(`Horizons HTTP ${response.status}`);
    const payload = await response.json();
    if (payload.error || !payload.result) throw new Error(payload.error || 'Horizons returned no result');
    const raw = payload.result;
    if (!raw.includes('$$SOE') || !raw.includes('$$EOE')) throw new Error(`Horizons ${target}: expected data markers not found`);
    const body = raw.split('$$SOE')[1].split('$$EOE')[0].trim();
    const rows = body.split(/\r?\n/).filter(line => line.trim());
    return { raw, row_count: rows.length, rows: rows.slice(0, 4) };
  }
  try {
    const [sun, earth] = await Promise.all([get('10'), get('399')]);
    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).json({ api: API, targets: { Sun: '10', Earth: '399' }, observer_test_point: { latitude_deg: lat, east_longitude_deg: lon, altitude_km: alt }, start, stop, step: '1h', quantities: '4', sun, earth });
  } catch (error) { return res.status(502).json({ error: error.message || 'Horizons request failed' }); }
}

