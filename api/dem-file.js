import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';

const DEM_URL = 'https://pgda.gsfc.nasa.gov/data/LOLA_5mpp/Site01/Site01_final_adj_5mpp_surf.tif';

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
  try {
    const response = await fetch(DEM_URL, { signal: AbortSignal.timeout(55_000) });
    if (!response.ok || !response.body) throw new Error(`NASA DEM download failed: HTTP ${response.status}`);
    res.setHeader('Content-Type', response.headers.get('content-type') || 'image/tiff');
    res.setHeader('Content-Disposition', 'attachment; filename="Site01_final_adj_5mpp_surf.tif"');
    res.setHeader('Cache-Control', 'no-store');
    const length = response.headers.get('content-length');
    if (length) res.setHeader('Content-Length', length);
    await pipeline(Readable.fromWeb(response.body), res);
  } catch (error) {
    if (!res.headersSent) return res.status(502).json({ error: error.message || 'NASA DEM download failed' });
    res.destroy(error);
  }
}

