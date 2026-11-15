import { fromArrayBuffer } from 'geotiff';
import { createHash } from 'node:crypto';

const DEM_URL = 'https://pgda.gsfc.nasa.gov/data/LOLA_5mpp/Site01/Site01_final_adj_5mpp_surf.tif';

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
  try {
    const response = await fetch(DEM_URL, { signal: AbortSignal.timeout(55_000) });
    if (!response.ok) throw new Error(`NASA download failed: HTTP ${response.status}`);
    const buffer = Buffer.from(await response.arrayBuffer());
    if (buffer.byteLength <= 100_000) throw new Error('NASA DEM download appears incomplete');
    const sha256 = createHash('sha256').update(buffer).digest('hex');
    const arrayBuffer = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
    const image = await (await fromArrayBuffer(arrayBuffer)).getImage();
    const width = image.getWidth(), height = image.getHeight();
    const winWidth = Math.min(1200, width), winHeight = Math.min(1200, height);
    const x0 = Math.max(0, Math.floor((width - winWidth) / 2)), y0 = Math.max(0, Math.floor((height - winHeight) / 2));
    const raster = await image.readRasters({ window: [x0, y0, x0 + winWidth, y0 + winHeight], samples: [0] });
    const values = raster[0], nodata = image.getGDALNoData();
    const valid = [];
    for (const n of values) if (Number.isFinite(n) && (nodata == null || n !== nodata)) valid.push(Number(n));
    if (!valid.length) throw new Error('No valid pixels in inspected window');
    valid.sort((a, b) => a - b);
    const percentile = p => valid[Math.floor((valid.length - 1) * p)];
    const stride = Math.max(1, Math.ceil(Math.max(winWidth, winHeight) / 500));
    const pixels = [];
    for (let y = 0; y < winHeight; y += stride) for (let x = 0; x < winWidth; x += stride) pixels.push(Number(values[y * winWidth + x]));
    const pixelWidth = Math.ceil(winWidth / stride), pixelHeight = Math.ceil(winHeight / stride);
    const meta = {
      width, height, count: image.getSamplesPerPixel(), dtype: image.getGDALMetadata()?.dtype ?? 'metadata unavailable',
      crs: image.getGeoKeys() ?? null, transform: image.getTiePoints()?.[0] ?? null,
      bounds: image.getBoundingBox(), resolution: image.getResolution(), nodata,
      units: image.getGDALMetadata()?.units ?? null, inspected_window: { x: x0, y: y0, width: winWidth, height: winHeight }
    };
    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).json({ url: DEM_URL, filename: 'Site01_final_adj_5mpp_surf.tif', file_size_bytes: buffer.byteLength, size_mib: +(buffer.byteLength / 1048576).toFixed(2), sha256, metadata: meta, statistics: { valid_pixel_count: valid.length, min: valid[0], median: percentile(.5), max: valid.at(-1) }, pixels, pixel_width: pixelWidth, pixel_height: pixelHeight, display_stride: stride });
  } catch (error) { return res.status(502).json({ error: error.message || 'NASA DEM retrieval failed' }); }
}

