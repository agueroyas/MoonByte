import JSZip from 'https://esm.sh/jszip@3.10.1';

const $ = id => document.getElementById(id);
const state = { dem: null, horizons: null };
const toast = message => { const el = $('toast'); el.textContent = message; el.classList.add('show'); clearTimeout(toast.timer); toast.timer = setTimeout(() => el.classList.remove('show'), 3800); };
function setStatus(label) { $('statusText').textContent = label; }
function setBusy(button, busy, label) { button.disabled = busy; if (busy) { button.dataset.label = button.textContent; button.textContent = label; } else if (button.dataset.label) { button.textContent = button.dataset.label; delete button.dataset.label; } }
function drawTerrain(data) {
  const canvas = $('terrainMap'); const ctx = canvas.getContext('2d');
  const width = data.pixel_width, height = data.pixel_height; const values = data.pixels;
  const lo = data.statistics.min, hi = data.statistics.max, spread = hi - lo || 1;
  const image = ctx.createImageData(width, height);
  for (let i = 0; i < values.length; i++) {
    const t = Math.max(0, Math.min(1, (values[i] - lo) / spread));
    const ramp = t < .35 ? [22 + t * 45, 36 + t * 48, 49 + t * 44] : t < .72 ? [38 + (t - .35) * 115, 53 + (t - .35) * 120, 64 + (t - .35) * 91] : [80 + (t - .72) * 420, 96 + (t - .72) * 420, 78 + (t - .72) * 350];
    const shade = i % width ? Math.max(.65, Math.min(1.22, 1 + (values[i] - values[i - 1]) / spread * 8)) : 1;
    image.data[i * 4] = Math.min(255, ramp[0] * shade); image.data[i * 4 + 1] = Math.min(255, ramp[1] * shade); image.data[i * 4 + 2] = Math.min(255, ramp[2] * shade); image.data[i * 4 + 3] = 255;
  }
  const temp = document.createElement('canvas'); temp.width = width; temp.height = height; temp.getContext('2d').putImageData(image, 0, 0);
  ctx.clearRect(0, 0, canvas.width, canvas.height); ctx.imageSmoothingEnabled = true; ctx.drawImage(temp, 0, 0, canvas.width, canvas.height);
  $('mapLabel').textContent = 'NASA LOLA / SITE01 · ACTUAL PIXELS';
}
async function loadDem() {
  const button = $('loadDem'); setBusy(button, true, 'Downloading…'); setStatus('FETCHING NASA DEM'); $('demState').textContent = 'DOWNLOADING';
  try {
    const response = await fetch('/api/dem'); const data = await response.json(); if (!response.ok) throw new Error(data.error || 'NASA download failed');
    state.dem = data; drawTerrain(data); $('demState').textContent = 'NASA DATA LOADED';
    const s = data.statistics; $('terrainStats').innerHTML = `<div><span>DIMENSIONS</span><b>${data.metadata.width.toLocaleString()} × ${data.metadata.height.toLocaleString()}</b></div><div><span>VALID PIXELS</span><b>${s.valid_pixel_count.toLocaleString()}</b></div><div><span>STORED VALUE RANGE</span><b>${s.min} / ${s.median} / ${s.max}</b></div><div><span>SHA-256</span><b class="hash">${data.sha256}</b></div>`;
    setStatus('DEM ANALYZED'); toast(`NASA DEM loaded · ${data.size_mib} MiB · SHA-256 recorded`);
  } catch (error) { $('demState').textContent = 'FETCH FAILED'; setStatus('SOURCE UNAVAILABLE'); toast(error.message); }
  finally { setBusy(button, false); }
}
async function fetchHorizons() {
  const button = $('fetchHorizons'); setBusy(button, true, 'Querying JPL Horizons…'); setStatus('QUERYING HORIZONS');
  try {
    const query = new URLSearchParams({ lat: $('lat').value, lon: $('lon').value, alt: $('alt').value, start: $('start').value, stop: $('stop').value });
    const response = await fetch(`/api/horizons?${query}`); const data = await response.json(); if (!response.ok) throw new Error(data.error || 'Horizons request failed');
    state.horizons = data;
    $('sunState').textContent = 'RECORDS RECEIVED'; $('sunRows').textContent = `${data.sun.row_count} rows`;
    $('earthState').textContent = 'RECORDS RECEIVED'; $('earthRows').textContent = `${data.earth.row_count} rows`;
    setStatus('EPHEMERIS RECEIVED'); toast(`JPL Horizons returned ${data.sun.row_count} Sun and ${data.earth.row_count} Earth records`);
  } catch (error) { $('sunState').textContent = 'REQUEST FAILED'; $('earthState').textContent = 'REQUEST FAILED'; toast(error.message); setStatus('HORIZONS UNAVAILABLE'); }
  finally { setBusy(button, false); }
}
async function exportArchive() {
  if (!state.dem && !state.horizons) return toast('Fetch the NASA DEM or JPL ephemeris first to create an output archive.');
  const zip = new JSZip(); const rawFiles = [];
  if (state.horizons) { zip.file('horizons_sun_raw.txt', state.horizons.sun.raw); zip.file('horizons_earth_raw.txt', state.horizons.earth.raw); rawFiles.push('horizons_sun_raw.txt', 'horizons_earth_raw.txt'); }
  const provenance = {
    project: 'ARTEMIS PRISM', test_version: '0.1', generated_at_utc: new Date().toISOString(),
    dem: state.dem ? { product: 'NASA GSFC PGDA Product 78', name: 'LOLA Site01 surface-interpolated DEM', url: state.dem.url, filename: state.dem.filename, sha256: state.dem.sha256, file_size_bytes: state.dem.file_size_bytes, metadata: state.dem.metadata, statistics: state.dem.statistics, caveat: 'NASA reports about 90% interpolated 5 m pixels; nominal posting is not independent measurement resolution.' } : null,
    horizons: state.horizons ? { api: state.horizons.api, targets: state.horizons.targets, observer_test_point: state.horizons.observer_test_point, start: state.horizons.start, stop: state.horizons.stop, step: '1h', quantities: '4', raw_files: rawFiles, caveat: 'Test observer point is not verified as the Site01 DEM center.' } : null,
    note: 'This archive contains only fetched real source data; no synthetic measurements are substituted.'
  };
  zip.file('provenance.json', JSON.stringify(provenance, null, 2));
  const blob = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE' }); const link = document.createElement('a'); link.href = URL.createObjectURL(blob); link.download = 'ARTEMIS_PRISM_test_outputs.zip'; link.click(); setTimeout(() => URL.revokeObjectURL(link.href), 1000); toast('Provenance archive downloaded.');
}
$('loadDem').addEventListener('click', loadDem); $('fetchHorizons').addEventListener('click', fetchHorizons); $('runAll').addEventListener('click', async () => { setStatus('RUNNING ANALYSIS'); await Promise.all([loadDem(), fetchHorizons()]); });
$('langBtn').addEventListener('click', () => toast('English interface · Arabic control is available for the next release.'));
setInterval(() => { $('clock').textContent = `UTC ${new Date().toISOString().slice(11, 19)}`; }, 1000);
const exportButton = document.createElement('button'); exportButton.className = 'smallbtn'; exportButton.textContent = '↓ Export ZIP'; exportButton.addEventListener('click', exportArchive); $('provenance').querySelector('.panel-head').appendChild(exportButton);
const canvas = $('terrainMap').getContext('2d'); const gradient = canvas.createLinearGradient(0, 0, 0, 370); gradient.addColorStop(0, '#1b2b32'); gradient.addColorStop(.5, '#26373c'); gradient.addColorStop(1, '#111922'); canvas.fillStyle = gradient; canvas.fillRect(0, 0, 860, 370); canvas.strokeStyle = '#81938416'; for (let x = 0; x < 860; x += 24) { canvas.beginPath(); canvas.moveTo(x, 0); canvas.lineTo(x + 120, 370); canvas.stroke(); }

