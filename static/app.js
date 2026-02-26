const apiBase = '/api/weather';

const el = id => document.getElementById(id);
const qInput = el('q');
const searchBtn = el('search');
const geoBtn = el('geolocate');
const unitsSelect = el('units-select');
const langSelect = el('lang-select');
const shareBtn = el('share-btn');
const currentDiv = el('current');
const dailyDiv = el('daily');
const favDiv = el('favorites');
const recentDiv = el('recent');

let hourlyChart = null;
let map = null;
let marker = null;
let radarLayer = null;

function initMap() {
  try {
    if (typeof L === 'undefined') return;
    map = L.map('map', { zoomControl: true }).setView([20, 0], 2);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19 }).addTo(map);
  } catch (err) {
    console.warn('Map initialization skipped:', err);
  }
}

function init() {
  attachEvents();
  initMap();
  loadConfig();
  loadFavorites();
  loadRecent();

  const params = new URLSearchParams(location.search);
  if (params.get('units')) unitsSelect.value = params.get('units');
  if (params.get('lang')) langSelect.value = params.get('lang');

  if (params.get('q')) {
    qInput.value = params.get('q');
    fetchAndRender({ q: params.get('q') });
  } else if (params.get('lat') && params.get('lon')) {
    fetchAndRender({ lat: params.get('lat'), lon: params.get('lon') });
  } else {
    // Location Auto-detect: Use browser geolocation to show local weather on load
    const recents = JSON.parse(localStorage.getItem('weather.v2.recent') || '[]');
    if (recents.length > 0) {
      // Re-fetch the last searched location
      fetchAndRender(recents[0]);
    } else {
      // First time using app: ask for geolocation automatically
      geolocateAndFetch();
    }
  }
}

function attachEvents() {
  searchBtn.onclick = () => fetchAndRender({ q: qInput.value });
  qInput.addEventListener('keydown', e => { if (e.key === 'Enter') fetchAndRender({ q: qInput.value }); });
  geoBtn.onclick = geolocateAndFetch;
  unitsSelect.onchange = () => { if (lastQuery) fetchAndRender(lastQuery); };
  langSelect.onchange = () => { if (lastQuery) fetchAndRender(lastQuery); };
  shareBtn.onclick = copyShareLink;
}

let lastQuery = null;
let lastWeatherData = null;

async function fetchAndRender(query) {
  lastQuery = query;
  const units = unitsSelect.value;
  const lang = langSelect.value;
  const params = new URLSearchParams();
  if (query.q) params.set('q', query.q);
  if (query.lat && query.lon) {
    params.set('lat', query.lat);
    params.set('lon', query.lon);
  }
  params.set('units', units);
  params.set('lang', lang);

  try {
    const res = await fetch(apiBase + '?' + params.toString());
    if (!res.ok) throw new Error('API error');
    const data = await res.json();
    lastWeatherData = data;
    renderCurrent(data);
    renderHourly(data);
    renderDaily(data);
    updateMap(data);
    saveRecentSearch(data);
    updateShareUrl(data);
  } catch (err) {
    currentDiv.innerHTML = `<div style="color:#ef4444;background:#fee2e2;padding:12px;border-radius:8px">Error fetching data: ${err.message}</div>`;
  }
}

function renderCurrent(payload) {
  const cur = payload.current;
  if (!cur) return;
  const temp = Math.round(cur.temp);
  const desc = cur.weather && cur.weather[0] && cur.weather[0].description;
  const icon = cur.weather && cur.weather[0] ? cur.weather[0].icon : null;
  const humidity = cur.humidity;
  const wind = cur.wind_speed || cur.wind_deg || 0;

  const uvi = cur.uvi !== undefined ? cur.uvi : '—';
  let uvColor = '#10b981'; // green
  if (uvi >= 3) uvColor = '#facc15'; // yellow
  if (uvi >= 6) uvColor = '#f97316'; // orange
  if (uvi >= 8) uvColor = '#ef4444'; // red
  if (uvi >= 11) uvColor = '#a855f7'; // purple

  const unitTxt = payload.units === 'metric' ? { t: '°C', v: 'm/s' } : { t: '°F', v: 'mph' };

  const iconImg = icon ? `<img src="https://openweathermap.org/img/wn/${icon}@4x.png" style="width:80px;height:80px;vertical-align:middle;margin:-10px" />` : '';

  // Calculate logic for Day and Night modes + Local Time
  const utcNow = Math.floor(Date.now() / 1000);
  const sunrise = cur.sunrise || 0;
  const sunset = cur.sunset || 0;

  if (sunrise > 0 && sunset > 0) {
    if (utcNow < sunrise || utcNow >= sunset) {
      document.body.classList.remove('day');
      document.body.classList.add('night');
    } else {
      document.body.classList.remove('night');
      document.body.classList.add('day');
    }
  } else {
    document.body.classList.remove('night');
    document.body.classList.add('day'); // fallback
  }

  // tz offset from API is in seconds
  const tzSec = payload.timezone || 0;
  const localNow = new Date((utcNow + tzSec) * 1000);
  // Format as UTC because we manually applied the offset
  const localTimeStr = localNow.toLocaleTimeString('en-US', { timeZone: 'UTC', hour: '2-digit', minute: '2-digit' });
  const localDateStr = localNow.toLocaleDateString('en-US', { timeZone: 'UTC', weekday: 'short', month: 'short', day: 'numeric' });

  // Dynamically adapt dark mode UV text 
  const isNight = document.body.classList.contains('night');
  const uvTextColor = (uvi >= 3 && uvi < 6) ? '#000' : '#fff';

  currentDiv.innerHTML = `
    <div style="display:flex;align-items:center;gap:12px;margin-bottom:8px">
      ${iconImg}
      <div>
        <div style="font-size:2rem;font-weight:700">${payload.location || 'Unknown Location'}</div>
        <div style="font-size:0.95rem;opacity:0.9">🕒 ${localTimeStr} &middot; 📅 ${localDateStr}</div>
      </div>
      <div style="margin-left:auto;font-size:2.8rem;font-weight:700">${temp}${unitTxt.t}</div>
    </div>
    <div class="small" style="text-transform:capitalize;font-size:1.05rem;opacity:0.95;margin-left:8px">
      ${desc} &middot; 💧 ${humidity}% &middot; 🌬 ${wind} ${unitTxt.v} &middot; 
      <span style="display:inline-block;padding:2px 8px;border-radius:6px;color:${uvTextColor};background:${uvColor};font-weight:600;font-size:0.85rem">UV: ${uvi}</span>
    </div>
  `;
  renderAQI(payload.air_pollution);
  renderAlerts(payload.alerts);
}

function renderHourly(payload) {
  const hourly = (payload.hourly || []).slice(0, 24);
  const labels = hourly.map(h => new Date(h.dt * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));
  const temps = hourly.map(h => h.temp);
  const pops = hourly.map(h => Math.round((h.pop || 0) * 100)); // probability of precipitation %

  const ctx = el('hourlyChart').getContext('2d');
  if (hourlyChart) hourlyChart.destroy();

  hourlyChart = new Chart(ctx, {
    type: 'line',
    data: {
      labels,
      datasets: [
        { label: 'Temp', data: temps, borderColor: '#ef4444', backgroundColor: 'rgba(239,68,68,0.12)', tension: 0.3, yAxisID: 'y' },
        { label: 'Precip Chance %', data: pops, borderColor: '#3b82f6', backgroundColor: 'rgba(59,130,246,0.5)', type: 'bar', yAxisID: 'y1' }
      ]
    },
    options: {
      responsive: true,
      scales: {
        y: { type: 'linear', position: 'left', ticks: { callback: v => `${Math.round(v)}°` } },
        y1: {
          type: 'linear', position: 'right', min: 0, max: 100, ticks: { callback: v => `${v}%` },
          grid: { drawOnChartArea: false }
        }
      }
    }
  });
}

function renderDaily(payload) {
  const daily = payload.daily || [];
  dailyDiv.innerHTML = '';
  daily.slice(0, 7).forEach(d => {
    const date = new Date(d.dt * 1000).toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' });
    const icon = d.weather && d.weather[0] && d.weather[0].icon;
    const max = Math.round(d.temp.max);
    const min = Math.round(d.temp.min);
    const desc = d.weather[0].main;
    const iconUrl = icon ? `https://openweathermap.org/img/wn/${icon}.png` : '';

    const elDay = document.createElement('div'); elDay.className = 'day';
    elDay.innerHTML = `
      <div class="small">${date}</div>
      ${iconUrl ? `<img src="${iconUrl}" width="50" height="50" style="margin:-5px 0" />` : ''}
      <div style="font-weight:700">${max}°/ ${min}°</div>
      <div class="small" style="font-size:0.8rem">${desc}</div>
    `;
    dailyDiv.appendChild(elDay);
  });
}

function updateMap(payload) {
  if (!map) return;
  const lat = Number(payload.lat);
  const lon = Number(payload.lon);
  if (!isFinite(lat) || !isFinite(lon)) return;
  try {
    map.setView([lat, lon], 9);
    if (marker) marker.setLatLng([lat, lon]); else marker = L.marker([lat, lon]).addTo(map);
  } catch (e) { }
}

function saveRecentSearch(data) {
  if (!data.location) return;
  let recents = JSON.parse(localStorage.getItem('weather.recent') || '[]');
  // Avoid duplicates
  recents = recents.filter(r => r.label !== data.location);
  recents.unshift({ lat: data.lat, lon: data.lon, label: data.location, q: lastQuery.q });
  recents = recents.slice(0, 5); // Keep last 5
  localStorage.setItem('weather.v2.recent', JSON.stringify(recents));
  loadRecent();
}

function loadRecent() {
  const recents = JSON.parse(localStorage.getItem('weather.v2.recent') || '[]');
  recentDiv.innerHTML = '';
  if (recents.length === 0) {
    recentDiv.innerHTML = '<div class="small">No recent searches</div>';
  }
  recents.forEach(r => {
    const node = document.createElement('div'); node.className = 'fav-item';
    node.innerHTML = `<span style="cursor:pointer;flex:1;font-weight:600;color:#1e40af">${r.label}</span>`;
    node.children[0].onclick = () => fetchAndRender({ lat: r.lat, lon: r.lon, q: r.q });
    recentDiv.appendChild(node);
  });
}

function loadFavorites() {
  const favs = JSON.parse(localStorage.getItem('weather.v2.favs') || '[]');
  favDiv.innerHTML = '';
  if (favs.length === 0) {
    favDiv.innerHTML = '<div class="small">No favorites added</div>';
  }
  favs.forEach(f => {
    const node = document.createElement('div'); node.className = 'fav-item';
    node.innerHTML = `<span style="cursor:pointer;flex:1;font-weight:600;color:#1e40af">⭐ ${f.label}</span><div><button data-remove="${f.label}" style="background:#ef4444;padding:4px 8px" title="Remove">✖</button></div>`;
    node.children[0].onclick = () => fetchAndRender({ lat: f.lat, lon: f.lon });
    favDiv.appendChild(node);
  });
  favDiv.querySelectorAll('button[data-remove]').forEach(b => b.onclick = e => { removeFavorite(b.dataset.remove); loadFavorites(); });
}

function addFavorite(label, lat, lon) {
  let favs = JSON.parse(localStorage.getItem('weather.v2.favs') || '[]');
  if (favs.some(f => f.label === label)) return; // Already fav
  favs.unshift({ label, lat, lon });
  localStorage.setItem('weather.v2.favs', JSON.stringify(favs.slice(0, 8)));
  loadFavorites();
}

function removeFavorite(label) {
  const favs = JSON.parse(localStorage.getItem('weather.v2.favs') || '[]').filter(f => f.label !== label);
  localStorage.setItem('weather.v2.favs', JSON.stringify(favs));
}

async function geolocateAndFetch() {
  if (!navigator.geolocation) return alert('Geolocation not supported by your browser.');
  navigator.geolocation.getCurrentPosition(pos => {
    const lat = pos.coords.latitude; const lon = pos.coords.longitude;
    fetchAndRender({ lat, lon });
  }, () => console.log('Could not get geolocation automatically. Check browser permissions.'));
}

function updateShareUrl(data) {
  if (!data) return;
  const params = new URLSearchParams();
  if (data.lat && data.lon) { params.set('lat', data.lat); params.set('lon', data.lon); }
  if (lastQuery && lastQuery.q) params.set('q', lastQuery.q);
  params.set('units', unitsSelect.value);
  params.set('lang', langSelect.value);
  history.replaceState({}, '', location.pathname + '?' + params.toString());
}

function copyShareLink() {
  const url = location.href;
  navigator.clipboard.writeText(url)
    .then(() => alert('Shareable link copied to clipboard!'))
    .catch(err => alert('Failed to copy link: ' + err));
}

function renderAQI(ap) {
  const elAqi = document.getElementById('aqi');
  if (!ap || !ap.list || !ap.list.length) { elAqi.innerHTML = ''; return; }
  const aqiVal = ap.list[0].main.aqi; // 1-5
  const mapTxt = { 1: 'Good', 2: 'Fair', 3: 'Moderate', 4: 'Poor', 5: 'Very Poor' };
  const colors = { 1: '#10b981', 2: '#60a5fa', 3: '#facc15', 4: '#f97316', 5: '#ef4444' };
  const tColors = { 1: '#064e3b', 2: '#1e3a8a', 3: '#713f12', 4: '#7c2d12', 5: '#7f1d1d' };
  elAqi.innerHTML = `<div style="padding:10px;border-radius:8px;background:${colors[aqiVal]}30;border:1px solid ${colors[aqiVal]}80;color:${tColors[aqiVal]}">
    <strong>Air Quality (AQI): ${mapTxt[aqiVal]} (${aqiVal})</strong>
  </div>`;
}

function renderAlerts(alerts) {
  const el = document.getElementById('alerts');
  if (!alerts || !alerts.length) { el.innerHTML = ''; return; }
  el.innerHTML = '<div style="margin-top:8px"><strong style="color:#ef4444">⚠ Severe Weather Alerts:</strong></div>' +
    alerts.map(a => `
      <div style="margin-top:6px;padding:12px;border-radius:8px;background:#fef2f2;border:1px solid #fca5a5">
        <div style="font-weight:700;color:#991b1b;font-size:1.1rem">${a.event}</div>
        <div class="small" style="margin-top:2px">${a.sender_name || ''}</div>
        <div style="margin-top:8px;font-size:0.95rem;line-height:1.4">${a.description || ''}</div>
      </div>
    `).join('');
}

async function loadConfig() {
  try {
    const res = await fetch('/config');
    if (!res.ok) return;
    const cfg = await res.json();
    if (cfg.tile_api_key) addRadarLayer(cfg.tile_api_key);
  } catch (e) { }
}

function addRadarLayer(key) {
  const url = `https://tile.openweathermap.org/map/precipitation_new/{z}/{x}/{y}.png?appid=${key}`;
  radarLayer = L.tileLayer(url, { opacity: 0.6 });
  radarLayer.addTo(map);
}

document.addEventListener('click', (e) => {
  if (e.target && e.target.id === 'add-fav') {
    if (lastWeatherData) {
      addFavorite(lastWeatherData.location || 'Unknown Location', lastWeatherData.lat, lastWeatherData.lon);
    } else {
      alert('No location to add. Search or use geolocation first.');
    }
  }
});

document.addEventListener('DOMContentLoaded', init);
