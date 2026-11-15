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
  $('mapLabel').textContent = 'بيانات NASA LOLA · بكسلات أصلية';
}
async function loadDem() {
  const button = $('loadDem'); setBusy(button, true, 'جارٍ التحميل…'); setStatus('جارٍ جلب نموذج NASA'); $('demState').textContent = 'جارٍ التحميل';
  try {
    const response = await fetch('/api/dem'); const data = await response.json(); if (!response.ok) throw new Error(data.error || 'تعذر تنزيل ملف NASA');
    state.dem = data; drawTerrain(data); $('demState').textContent = 'تم تحميل بيانات NASA';
    const s = data.statistics; $('terrainStats').innerHTML = `<div><span>أبعاد الملف</span><b>${data.metadata.width.toLocaleString()} × ${data.metadata.height.toLocaleString()}</b></div><div><span>البكسلات الصالحة</span><b>${s.valid_pixel_count.toLocaleString()}</b></div><div><span>أدنى / وسيط / أعلى قيمة</span><b>${s.min} / ${s.median} / ${s.max}</b></div><div><span>بصمة SHA-256</span><b class="hash">${data.sha256}</b></div>`;
    document.querySelector('.metadata-details')?.remove();
    const details = document.createElement('details'); details.className = 'metadata-details';
    const summary = document.createElement('summary'); summary.textContent = 'عرض بيانات GeoTIFF وإطار الإحداثيات';
    const preview = document.createElement('pre'); preview.textContent = JSON.stringify(data.metadata, null, 2);
    details.append(summary, preview); $('terrainStats').after(details);
    setStatus('تم تحليل DEM بنجاح'); toast(`تم تحميل نموذج NASA · ${data.size_mib} ميجابايت · بصمة الملف محفوظة`);
  } catch (error) { $('demState').textContent = 'تعذر جلب البيانات'; setStatus('تعذر الاتصال بالمصدر'); toast(error.message); }
  finally { setBusy(button, false); }
}
async function fetchHorizons() {
  const button = $('fetchHorizons'); setBusy(button, true, 'جارٍ الاتصال…'); setStatus('جارٍ طلب بيانات Horizons');
  try {
    const query = new URLSearchParams({ lat: $('lat').value, lon: $('lon').value, alt: $('alt').value, start: $('start').value, stop: $('stop').value });
    const response = await fetch(`/api/horizons?${query}`); const data = await response.json(); if (!response.ok) throw new Error(data.error || 'تعذر جلب بيانات Horizons');
    state.horizons = data;
    $('sunState').textContent = 'وصلت السجلات'; $('sunRows').textContent = `${data.sun.row_count} سجل`;
    $('earthState').textContent = 'وصلت السجلات'; $('earthRows').textContent = `${data.earth.row_count} سجل`;
    for (const [target, value] of [['sun', data.sun], ['earth', data.earth]]) {
      document.querySelector(`.ephem-preview[data-target="${target}"]`)?.remove();
      const preview = document.createElement('pre'); preview.className = 'ephem-preview'; preview.dataset.target = target; preview.textContent = value.rows.join('\n');
      $(`${target}Rows`).closest('.target-row').after(preview);
    }
    setStatus('وصلت بيانات الأجرام'); toast(`وصل ${data.sun.row_count} سجلًا للشمس و${data.earth.row_count} سجلًا للأرض`);
  } catch (error) { $('sunState').textContent = 'تعذر إتمام الطلب'; $('earthState').textContent = 'تعذر إتمام الطلب'; toast(error.message); setStatus('تعذر الاتصال بـHorizons'); }
  finally { setBusy(button, false); }
}
async function exportArchive() {
  if (!state.dem && !state.horizons) return toast('اجلب بيانات NASA أو Horizons أولًا لإنشاء الأرشيف.');
  const zip = new JSZip(); const rawFiles = [];
  if (state.dem) {
    toast('جارٍ تنزيل ملف GeoTIFF الأصلي لإضافته للأرشيف…');
    const response = await fetch('/api/dem-file'); if (!response.ok) { const error = await response.json().catch(() => ({})); throw new Error(error.error || 'تعذر تنزيل ملف NASA'); }
    const demBlob = await response.blob();
    const digest = await crypto.subtle.digest('SHA-256', await demBlob.arrayBuffer());
    const hash = Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
    if (hash !== state.dem.sha256) throw new Error('بصمة ملف GeoTIFF لا تطابق الملف الذي جرى تحليله.');
    zip.file(state.dem.filename, demBlob); rawFiles.push(state.dem.filename);
  }
  if (state.horizons) { zip.file('horizons_sun_raw.txt', state.horizons.sun.raw); zip.file('horizons_earth_raw.txt', state.horizons.earth.raw); rawFiles.push('horizons_sun_raw.txt', 'horizons_earth_raw.txt'); }
  const provenance = {
    project: 'ARTEMIS PRISM', test_version: '0.1', generated_at_utc: new Date().toISOString(),
    dem: state.dem ? { product: 'NASA GSFC PGDA Product 78', name: 'LOLA Site01 surface-interpolated DEM', url: state.dem.url, filename: state.dem.filename, sha256: state.dem.sha256, file_size_bytes: state.dem.file_size_bytes, metadata: state.dem.metadata, statistics: state.dem.statistics, caveat: 'NASA reports about 90% interpolated 5 m pixels; nominal posting is not independent measurement resolution.' } : null,
    horizons: state.horizons ? { api: state.horizons.api, targets: state.horizons.targets, observer_test_point: state.horizons.observer_test_point, start: state.horizons.start, stop: state.horizons.stop, step: '1h', quantities: '4', raw_files: rawFiles, caveat: 'Test observer point is not verified as the Site01 DEM center.' } : null,
    note: 'This archive contains only fetched real source data; no synthetic measurements are substituted.'
  };
  zip.file('provenance.json', JSON.stringify(provenance, null, 2));
  const blob = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE' }); const link = document.createElement('a'); link.href = URL.createObjectURL(blob); link.download = 'ARTEMIS_PRISM_test_outputs.zip'; link.click(); setTimeout(() => URL.revokeObjectURL(link.href), 1000); toast('تم تنزيل أرشيف النتائج والبيانات المرجعية.');
}
$('loadDem').addEventListener('click', loadDem); $('fetchHorizons').addEventListener('click', fetchHorizons); $('runAll').addEventListener('click', async () => { setStatus('جارٍ تشغيل التحليل'); await Promise.all([loadDem(), fetchHorizons()]); });
setInterval(() => { $('clock').textContent = `UTC ${new Date().toISOString().slice(11, 19)}`; }, 1000);
const exportButton = document.createElement('button'); exportButton.className = 'smallbtn'; exportButton.textContent = '↓ تنزيل ZIP'; exportButton.addEventListener('click', () => exportArchive().catch(error => toast(error.message))); $('provenance').querySelector('.panel-heading').appendChild(exportButton);
const canvas = $('terrainMap').getContext('2d'); const gradient = canvas.createLinearGradient(0, 0, 0, 370); gradient.addColorStop(0, '#1b2b32'); gradient.addColorStop(.5, '#26373c'); gradient.addColorStop(1, '#111922'); canvas.fillStyle = gradient; canvas.fillRect(0, 0, 860, 370); canvas.strokeStyle = '#81938416'; for (let x = 0; x < 860; x += 24) { canvas.beginPath(); canvas.moveTo(x, 0); canvas.lineTo(x + 120, 370); canvas.stroke(); }

const moonIcon = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20.2 15.1A8.2 8.2 0 0 1 8.9 3.8a8.7 8.7 0 1 0 11.3 11.3Z"/></svg>';
const sunIcon = '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M4.93 4.93l1.42 1.42m11.3 11.3 1.42 1.42M2 12h2m16 0h2M4.93 19.07l1.42-1.42m11.3-11.3 1.42-1.42"/></svg>';
function applyTheme(theme) {
  document.documentElement.dataset.theme = theme;
  const light = theme === 'light';
  $('themeIcon').innerHTML = light ? moonIcon : sunIcon;
  $('themeLabel').textContent = light ? 'الوضع الداكن' : 'الوضع الفاتح';
  $('themeToggle').setAttribute('aria-label', light ? 'التبديل إلى الوضع الداكن' : 'التبديل إلى الوضع الفاتح');
  document.querySelector('meta[name="theme-color"]').content = light ? '#f2f5fa' : '#080b13';
  localStorage.setItem('artemis-prism-theme', theme);
}
applyTheme(localStorage.getItem('artemis-prism-theme') === 'light' ? 'light' : 'dark');
$('themeToggle').addEventListener('click', () => applyTheme(document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark'));

