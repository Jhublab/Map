/**
 * NEXUS MAP — app.js
 * Full-featured cyber-styled web mapping application
 * Uses: Leaflet.js, MarkerCluster, Nominatim, OSRM
 */

/* ═══════════════════════════════════════════════════════════
   1. CONSTANTS & STATE
═══════════════════════════════════════════════════════════ */
const STORAGE_KEY = 'nexusmap_data';

const LAYERS = {
  dark: L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
    attribution: '© OpenStreetMap © CARTO',
    subdomains: 'abcd',
    maxZoom: 19,
  }),
  standard: L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '© OpenStreetMap contributors',
    maxZoom: 19,
  }),
  topo: L.tileLayer('https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png', {
    attribution: '© OpenStreetMap contributors, © OpenTopoMap',
    maxZoom: 17,
  }),
};

// App state
const state = {
  map: null,
  mode: null,             // 'marker' | 'polyline' | 'polygon' | 'measure' | 'route'
  markers: [],            // { id, lat, lng, title, desc, leafletMarker }
  shapes: [],             // { id, type, coords, leafletLayer }
  clusterGroup: null,
  currentLayer: 'dark',

  // Route
  routeStart: null,
  routeEnd: null,
  routeStartStep: 'start', // 'start' | 'end'
  routeLine: null,
  routeMarkers: [],

  // Measure
  measurePoints: [],
  measureLine: null,
  measureMarkers: [],

  // Drawing
  drawPoints: [],
  drawPreviewLayer: null,
  drawTempMarkers: [],

  // Edit modal
  editingMarkerId: null,
};

/* ═══════════════════════════════════════════════════════════
   2. MAP INITIALIZATION
═══════════════════════════════════════════════════════════ */
function initMap() {
  state.map = L.map('map', {
    center: [20, 0],
    zoom: 3,
    zoomControl: true,
    attributionControl: true,
  });

  // Apply initial tile layer
  LAYERS[state.currentLayer].addTo(state.map);

  // Marker cluster group
  state.clusterGroup = L.markerClusterGroup({
    showCoverageOnHover: false,
    iconCreateFunction(cluster) {
      const count = cluster.getChildCount();
      return L.divIcon({
        html: `<div>${count}</div>`,
        className: 'marker-cluster marker-cluster-medium',
        iconSize: [40, 40],
      });
    },
  });
  state.map.addLayer(state.clusterGroup);

  // Map click handler
  state.map.on('click', onMapClick);

  // Mouse move → update coordinates
  state.map.on('mousemove', (e) => {
    const { lat, lng } = e.latlng;
    document.getElementById('coordDisplay').textContent =
      `${lat.toFixed(4)}°N  ${lng.toFixed(4)}°E`;
  });

  // Zoom change → update stat
  state.map.on('zoomend', () => {
    document.getElementById('statZoom').textContent = state.map.getZoom();
  });
  document.getElementById('statZoom').textContent = state.map.getZoom();
}

/* ═══════════════════════════════════════════════════════════
   3. MAP CLICK DISPATCHER
═══════════════════════════════════════════════════════════ */
function onMapClick(e) {
  const { lat, lng } = e.latlng;
  switch (state.mode) {
    case 'marker':   addMarker(lat, lng); break;
    case 'polyline': addDrawPoint(lat, lng, 'polyline'); break;
    case 'polygon':  addDrawPoint(lat, lng, 'polygon'); break;
    case 'measure':  addMeasurePoint(lat, lng); break;
    case 'route':    handleRouteTap(lat, lng); break;
    default: break;
  }
}

/* ═══════════════════════════════════════════════════════════
   4. MODE MANAGEMENT
═══════════════════════════════════════════════════════════ */
function setMode(newMode) {
  // Toggle off if already active
  if (state.mode === newMode) { exitMode(); return; }

  exitMode(false); // clear previous without hiding indicator yet
  state.mode = newMode;

  // UI
  document.getElementById('map').classList.add('mode-active');
  document.getElementById('modeIndicator').classList.remove('hidden');

  const modeLabels = {
    marker:   '◎ MARKER MODE  — click map to place',
    polyline: '╌ LINE MODE    — click to add points, dbl-click to finish',
    polygon:  '⬡ POLYGON MODE — click to add points, dbl-click to finish',
    measure:  '⊹ MEASURE MODE — click to add points, dbl-click to finish',
    route:    '⇢ ROUTE MODE   — set start then end point',
  };
  document.getElementById('modeText').textContent = modeLabels[newMode] || newMode.toUpperCase();

  // Highlight active button
  document.querySelectorAll('.nav-btn[data-mode]').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.mode === newMode);
  });

  // Show/hide sub-panels
  document.getElementById('routePanel').classList.toggle('hidden', newMode !== 'route');
  document.getElementById('measurePanel').classList.toggle('hidden', newMode !== 'measure');
}

function exitMode(updateUI = true) {
  state.mode = null;

  if (updateUI) {
    document.getElementById('map').classList.remove('mode-active');
    document.getElementById('modeIndicator').classList.add('hidden');
    document.querySelectorAll('.nav-btn[data-mode]').forEach(b => b.classList.remove('active'));
    document.getElementById('routePanel').classList.add('hidden');
    document.getElementById('measurePanel').classList.add('hidden');
  }

  // Clean up ongoing drawing preview
  if (state.drawPreviewLayer) {
    state.map.removeLayer(state.drawPreviewLayer);
    state.drawPreviewLayer = null;
  }
  state.drawTempMarkers.forEach(m => state.map.removeLayer(m));
  state.drawTempMarkers = [];
  state.drawPoints = [];
}

/* ═══════════════════════════════════════════════════════════
   5. MARKERS
═══════════════════════════════════════════════════════════ */
function createLeafletMarker(lat, lng, id) {
  const icon = L.divIcon({
    className: '',
    html: `<div class="custom-marker-icon" data-id="${id}"></div>`,
    iconSize: [28, 28],
    iconAnchor: [14, 28],
    popupAnchor: [0, -30],
  });
  return L.marker([lat, lng], { icon });
}

function buildPopupHTML(marker) {
  return `
    <div class="custom-popup">
      <div class="popup-title">${escapeHtml(marker.title || 'Untitled')}</div>
      <div class="popup-desc">${escapeHtml(marker.desc || 'No description.')}</div>
      <div class="popup-actions">
        <button class="popup-btn" onclick="openEditModal('${marker.id}')">Edit</button>
        <button class="popup-btn del" onclick="deleteMarker('${marker.id}')">Delete</button>
      </div>
    </div>
  `;
}

function addMarker(lat, lng, opts = {}) {
  const marker = {
    id: opts.id || uid(),
    lat,
    lng,
    title: opts.title || '',
    desc:  opts.desc  || '',
  };

  const leafletMarker = createLeafletMarker(lat, lng, marker.id);
  leafletMarker.bindPopup(buildPopupHTML(marker), { maxWidth: 260, className: '' });
  marker.leafletMarker = leafletMarker;

  state.clusterGroup.addLayer(leafletMarker);
  state.markers.push(marker);

  if (!opts.silent) {
    leafletMarker.openPopup();
    saveData();
    updateStats();
    toast('Marker added', 'success');
  }
  return marker;
}

function deleteMarker(id) {
  const idx = state.markers.findIndex(m => m.id === id);
  if (idx === -1) return;
  state.clusterGroup.removeLayer(state.markers[idx].leafletMarker);
  state.markers.splice(idx, 1);
  saveData();
  updateStats();
  toast('Marker deleted', 'info');
}

function refreshMarkerPopup(markerId) {
  const marker = state.markers.find(m => m.id === markerId);
  if (!marker) return;
  marker.leafletMarker.setPopupContent(buildPopupHTML(marker));
}

/* ═══════════════════════════════════════════════════════════
   6. EDIT MODAL
═══════════════════════════════════════════════════════════ */
function openEditModal(markerId) {
  const marker = state.markers.find(m => m.id === markerId);
  if (!marker) return;
  state.editingMarkerId = markerId;

  document.getElementById('markerTitle').value = marker.title || '';
  document.getElementById('markerDesc').value  = marker.desc  || '';
  document.getElementById('modalBackdrop').classList.remove('hidden');
}

function closeModal() {
  document.getElementById('modalBackdrop').classList.add('hidden');
  state.editingMarkerId = null;
}

function saveModal() {
  const marker = state.markers.find(m => m.id === state.editingMarkerId);
  if (!marker) return;
  marker.title = document.getElementById('markerTitle').value.trim();
  marker.desc  = document.getElementById('markerDesc').value.trim();
  refreshMarkerPopup(marker.id);
  saveData();
  closeModal();
  toast('Marker updated', 'success');
}

/* ═══════════════════════════════════════════════════════════
   7. DRAWING (POLYLINE / POLYGON)
═══════════════════════════════════════════════════════════ */
function addDrawPoint(lat, lng, type) {
  state.drawPoints.push([lat, lng]);

  // Temp vertex marker
  const vm = L.circleMarker([lat, lng], {
    radius: 5,
    color: '#00d2ff',
    fillColor: '#00d2ff',
    fillOpacity: 0.8,
    weight: 2,
  }).addTo(state.map);
  state.drawTempMarkers.push(vm);

  // Preview
  if (state.drawPreviewLayer) state.map.removeLayer(state.drawPreviewLayer);

  if (state.drawPoints.length >= 2) {
    const coords = type === 'polygon'
      ? [...state.drawPoints, state.drawPoints[0]]
      : state.drawPoints;
    state.drawPreviewLayer = L.polyline(coords, {
      color: '#00d2ff',
      weight: 2,
      dashArray: '6 4',
      opacity: 0.7,
    }).addTo(state.map);
  }
}

// Double-click finishes the shape
function finishDrawing(type) {
  if (state.drawPoints.length < 2) {
    toast('Need at least 2 points', 'warn');
    exitMode();
    return;
  }

  let layer;
  let infoText;

  if (type === 'polygon' && state.drawPoints.length >= 3) {
    layer = L.polygon(state.drawPoints, {
      color: '#00d2ff',
      fillColor: 'rgba(0,210,255,0.1)',
      fillOpacity: 0.3,
      weight: 2,
    });
    const area = computePolygonArea(state.drawPoints);
    infoText = `Area: ${formatArea(area)}`;
  } else {
    layer = L.polyline(state.drawPoints, {
      color: '#00ff88',
      weight: 2.5,
      opacity: 0.85,
    });
    const dist = computePolylineLength(state.drawPoints);
    infoText = `Length: ${formatDistance(dist)}`;
  }

  layer.addTo(state.map);
  layer.bindPopup(`
    <div class="custom-popup">
      <div class="popup-title">${type === 'polygon' ? 'Polygon' : 'Line'}</div>
      <div class="popup-desc">${infoText}</div>
      <div class="popup-actions">
        <button class="popup-btn del" onclick="deleteShape('${state.shapes.length}')">Delete</button>
      </div>
    </div>
  `).openPopup();

  const shape = {
    id: uid(),
    type,
    coords: [...state.drawPoints],
    leafletLayer: layer,
  };
  state.shapes.push(shape);

  // Rebind delete with correct id
  layer.setPopupContent(`
    <div class="custom-popup">
      <div class="popup-title">${type === 'polygon' ? 'Polygon' : 'Line'}</div>
      <div class="popup-desc">${infoText}</div>
      <div class="popup-actions">
        <button class="popup-btn del" onclick="deleteShape('${shape.id}')">Delete</button>
      </div>
    </div>
  `);

  saveData();
  updateStats();
  toast(`${type === 'polygon' ? 'Polygon' : 'Line'} drawn — ${infoText}`, 'success');
  exitMode();
}

window.deleteShape = function(id) {
  const idx = state.shapes.findIndex(s => s.id === id);
  if (idx === -1) return;
  state.map.removeLayer(state.shapes[idx].leafletLayer);
  state.shapes.splice(idx, 1);
  saveData();
  updateStats();
  toast('Shape deleted', 'info');
};

/* ═══════════════════════════════════════════════════════════
   8. MEASURE DISTANCE
═══════════════════════════════════════════════════════════ */
function addMeasurePoint(lat, lng) {
  state.measurePoints.push([lat, lng]);

  const vm = L.circleMarker([lat, lng], {
    radius: 5,
    color: '#ffd700',
    fillColor: '#ffd700',
    fillOpacity: 0.9,
    weight: 2,
  }).addTo(state.map);
  state.measureMarkers.push(vm);

  if (state.measureLine) state.map.removeLayer(state.measureLine);
  if (state.measurePoints.length >= 2) {
    state.measureLine = L.polyline(state.measurePoints, {
      color: '#ffd700',
      weight: 2,
      dashArray: '8 4',
      opacity: 0.8,
    }).addTo(state.map);

    const total = computePolylineLength(state.measurePoints);
    document.getElementById('measureTotal').textContent = formatDistance(total);
  }
}

function clearMeasure() {
  state.measurePoints = [];
  state.measureMarkers.forEach(m => state.map.removeLayer(m));
  state.measureMarkers = [];
  if (state.measureLine) { state.map.removeLayer(state.measureLine); state.measureLine = null; }
  document.getElementById('measureTotal').textContent = '0 m';
}

/* ═══════════════════════════════════════════════════════════
   9. ROUTE PLANNER
═══════════════════════════════════════════════════════════ */
function handleRouteTap(lat, lng) {
  if (state.routeStartStep === 'start') {
    // Set start
    state.routeStart = [lat, lng];
    state.routeStartStep = 'end';

    // Start marker
    clearRouteMarkers();
    const sm = L.marker([lat, lng], {
      icon: L.divIcon({
        className: '',
        html: '<div style="width:14px;height:14px;background:#00ff88;border-radius:50%;border:2px solid #fff;box-shadow:0 0 8px #00ff88"></div>',
        iconSize: [14, 14],
        iconAnchor: [7, 7],
      }),
    }).addTo(state.map);
    state.routeMarkers.push(sm);
    document.getElementById('routeStartLabel').textContent =
      `${lat.toFixed(4)}, ${lng.toFixed(4)}`;
    document.getElementById('btnCalculateRoute').disabled = true;
    toast('Start set — now click END point', 'info');

  } else {
    // Set end
    state.routeEnd = [lat, lng];
    state.routeStartStep = 'start'; // reset for next time

    const em = L.marker([lat, lng], {
      icon: L.divIcon({
        className: '',
        html: '<div style="width:14px;height:14px;background:#ff3366;border-radius:50%;border:2px solid #fff;box-shadow:0 0 8px #ff3366"></div>',
        iconSize: [14, 14],
        iconAnchor: [7, 7],
      }),
    }).addTo(state.map);
    state.routeMarkers.push(em);
    document.getElementById('routeEndLabel').textContent =
      `${lat.toFixed(4)}, ${lng.toFixed(4)}`;
    document.getElementById('btnCalculateRoute').disabled = false;
    toast('End set — click Calculate Route', 'info');
  }
}

async function calculateRoute() {
  if (!state.routeStart || !state.routeEnd) { toast('Set both points first', 'warn'); return; }

  const [sLat, sLng] = state.routeStart;
  const [eLat, eLng] = state.routeEnd;
  const url = `https://router.project-osrm.org/route/v1/driving/${sLng},${sLat};${eLng},${eLat}?overview=full&geometries=geojson`;

  toast('Calculating route…', 'info');
  document.getElementById('btnCalculateRoute').disabled = true;

  try {
    const res = await fetch(url);
    const data = await res.json();
    if (!data.routes || !data.routes.length) throw new Error('No route found');

    const route = data.routes[0];
    const coords = route.geometry.coordinates.map(([lng, lat]) => [lat, lng]);
    const dist  = (route.distance / 1000).toFixed(2);
    const time  = Math.round(route.duration / 60);

    if (state.routeLine) state.map.removeLayer(state.routeLine);
    state.routeLine = L.polyline(coords, {
      color: '#00d2ff',
      weight: 4,
      opacity: 0.9,
    }).addTo(state.map);

    state.map.fitBounds(state.routeLine.getBounds(), { padding: [40, 40] });

    const info = document.getElementById('routeInfo');
    info.classList.remove('hidden');
    info.innerHTML = `Distance: <strong>${dist} km</strong><br>Duration: <strong>~${time} min</strong>`;

    toast(`Route: ${dist} km (~${time} min)`, 'success');
  } catch (err) {
    toast('Route error: ' + err.message, 'error');
  } finally {
    document.getElementById('btnCalculateRoute').disabled = false;
  }
}

function clearRoute() {
  if (state.routeLine) { state.map.removeLayer(state.routeLine); state.routeLine = null; }
  clearRouteMarkers();
  state.routeStart = null;
  state.routeEnd = null;
  state.routeStartStep = 'start';
  document.getElementById('routeStartLabel').textContent = 'Click map: set START';
  document.getElementById('routeEndLabel').textContent   = 'Click map: set END';
  document.getElementById('routeInfo').classList.add('hidden');
  document.getElementById('btnCalculateRoute').disabled = true;
  toast('Route cleared', 'info');
}

function clearRouteMarkers() {
  state.routeMarkers.forEach(m => state.map.removeLayer(m));
  state.routeMarkers = [];
}

/* ═══════════════════════════════════════════════════════════
   10. GEOLOCATION
═══════════════════════════════════════════════════════════ */
function locateUser() {
  if (!navigator.geolocation) {
    toast('Geolocation not supported by your browser', 'error');
    return;
  }
  toast('Detecting location…', 'info');
  navigator.geolocation.getCurrentPosition(
    (pos) => {
      const { latitude: lat, longitude: lng } = pos.coords;
      state.map.setView([lat, lng], 14);

      // Accuracy circle
      const acc = pos.coords.accuracy;
      L.circle([lat, lng], {
        radius: acc,
        color: '#00ff88',
        fillColor: 'rgba(0,255,136,0.08)',
        fillOpacity: 1,
        weight: 1,
        dashArray: '4 4',
      }).addTo(state.map);

      // Location marker (pulse)
      L.marker([lat, lng], {
        icon: L.divIcon({
          className: '',
          html: '<div style="width:18px;height:18px;background:rgba(0,255,136,0.8);border-radius:50%;border:2px solid #fff;box-shadow:0 0 0 6px rgba(0,255,136,0.3),0 0 16px #00ff88;animation:pulse 2s infinite"></div>',
          iconSize: [18, 18],
          iconAnchor: [9, 9],
        }),
      }).addTo(state.map).bindPopup('<div class="custom-popup"><div class="popup-title">YOU ARE HERE</div></div>').openPopup();

      toast('Location found!', 'success');
    },
    (err) => {
      const msgs = {
        1: 'Permission denied — enable location in browser',
        2: 'Position unavailable',
        3: 'Request timed out',
      };
      toast(msgs[err.code] || 'Geolocation error', 'error');
    },
    { enableHighAccuracy: true, timeout: 10000 }
  );
}

/* ═══════════════════════════════════════════════════════════
   11. SEARCH (NOMINATIM)
═══════════════════════════════════════════════════════════ */
let searchTimeout = null;

function initSearch() {
  const input = document.getElementById('searchInput');
  const dropdown = document.getElementById('searchResults');

  input.addEventListener('input', () => {
    clearTimeout(searchTimeout);
    const q = input.value.trim();
    if (q.length < 3) { dropdown.classList.add('hidden'); return; }
    searchTimeout = setTimeout(() => performSearch(q), 400);
  });

  input.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { dropdown.classList.add('hidden'); input.blur(); }
  });

  // Close on outside click
  document.addEventListener('click', (e) => {
    if (!e.target.closest('.search-wrapper')) dropdown.classList.add('hidden');
  });
}

async function performSearch(query) {
  const dropdown = document.getElementById('searchResults');
  dropdown.innerHTML = '<div class="search-result-item" style="color:var(--text-dim)">Searching…</div>';
  dropdown.classList.remove('hidden');

  try {
    const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&limit=7`;
    const res  = await fetch(url, { headers: { 'Accept-Language': 'en' } });
    const data = await res.json();

    if (!data.length) {
      dropdown.innerHTML = '<div class="search-result-item" style="color:var(--text-dim)">No results found</div>';
      return;
    }

    dropdown.innerHTML = data.map(item => `
      <div class="search-result-item"
           data-lat="${item.lat}" data-lng="${item.lon}"
           onclick="selectSearchResult(${item.lat}, ${item.lon}, '${escapeAttr(item.display_name)}')">
        <div class="search-result-name">${escapeHtml(item.display_name.split(',')[0])}</div>
        <div class="search-result-addr">${escapeHtml(item.display_name)}</div>
      </div>
    `).join('');
  } catch (err) {
    dropdown.innerHTML = '<div class="search-result-item" style="color:var(--red)">Search failed — check connection</div>';
  }
}

window.selectSearchResult = function(lat, lng, name) {
  state.map.setView([lat, lng], 14);
  document.getElementById('searchResults').classList.add('hidden');
  document.getElementById('searchInput').value = name.split(',')[0];

  // Highlight pin
  L.popup({ className: '', maxWidth: 260 })
    .setLatLng([lat, lng])
    .setContent(`<div class="custom-popup"><div class="popup-title">⌕ ${escapeHtml(name.split(',')[0])}</div></div>`)
    .openOn(state.map);

  toast(`Navigated to: ${name.split(',')[0]}`, 'info');
};

/* ═══════════════════════════════════════════════════════════
   12. LOCAL STORAGE
═══════════════════════════════════════════════════════════ */
function saveData() {
  const data = {
    markers: state.markers.map(m => ({ id: m.id, lat: m.lat, lng: m.lng, title: m.title, desc: m.desc })),
    shapes:  state.shapes.map(s => ({ id: s.id, type: s.type, coords: s.coords })),
  };
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch (e) {
    toast('Storage full — data not saved', 'warn');
  }
}

function loadData(data) {
  // Markers
  (data.markers || []).forEach(m => addMarker(m.lat, m.lng, { ...m, silent: true }));

  // Shapes
  (data.shapes || []).forEach(s => restoreShape(s));

  updateStats();
}

function restoreShape(shapeData) {
  const { id, type, coords } = shapeData;
  let layer;

  if (type === 'polygon') {
    const area = computePolygonArea(coords);
    layer = L.polygon(coords, { color: '#00d2ff', fillColor: 'rgba(0,210,255,0.1)', fillOpacity: 0.3, weight: 2 });
    layer.bindPopup(`<div class="custom-popup"><div class="popup-title">Polygon</div><div class="popup-desc">Area: ${formatArea(area)}</div><div class="popup-actions"><button class="popup-btn del" onclick="deleteShape('${id}')">Delete</button></div></div>`);
  } else {
    const dist = computePolylineLength(coords);
    layer = L.polyline(coords, { color: '#00ff88', weight: 2.5, opacity: 0.85 });
    layer.bindPopup(`<div class="custom-popup"><div class="popup-title">Line</div><div class="popup-desc">Length: ${formatDistance(dist)}</div><div class="popup-actions"><button class="popup-btn del" onclick="deleteShape('${id}')">Delete</button></div></div>`);
  }

  layer.addTo(state.map);
  state.shapes.push({ id, type, coords, leafletLayer: layer });
}

/* ═══════════════════════════════════════════════════════════
   13. EXPORT / IMPORT
═══════════════════════════════════════════════════════════ */
function exportData() {
  const data = {
    version: 1,
    exported: new Date().toISOString(),
    markers: state.markers.map(m => ({ id: m.id, lat: m.lat, lng: m.lng, title: m.title, desc: m.desc })),
    shapes:  state.shapes.map(s => ({ id: s.id, type: s.type, coords: s.coords })),
  };
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = `nexusmap_${Date.now()}.json`;
  a.click();
  URL.revokeObjectURL(url);
  toast('Data exported!', 'success');
}

function triggerImport() {
  document.getElementById('importFile').click();
}

function handleImport(e) {
  const file = e.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = (ev) => {
    try {
      const data = JSON.parse(ev.target.result);
      clearAll(true);
      loadData(data);
      toast(`Imported ${data.markers?.length || 0} markers, ${data.shapes?.length || 0} shapes`, 'success');
    } catch {
      toast('Invalid JSON file', 'error');
    }
    e.target.value = ''; // reset input
  };
  reader.readAsText(file);
}

/* ═══════════════════════════════════════════════════════════
   14. SHARE VIA URL
═══════════════════════════════════════════════════════════ */
function shareUrl() {
  const data = {
    markers: state.markers.map(m => [m.lat, m.lng, m.title, m.desc]),
    shapes:  state.shapes.map(s => [s.type, s.coords]),
    view:    [state.map.getCenter().lat, state.map.getCenter().lng, state.map.getZoom()],
  };
  const encoded = btoa(encodeURIComponent(JSON.stringify(data)));
  const url = `${location.origin}${location.pathname}#data=${encoded}`;

  navigator.clipboard.writeText(url).then(() => {
    toast('Share URL copied to clipboard!', 'success');
  }).catch(() => {
    prompt('Copy this URL:', url);
  });
}

function loadFromUrl() {
  const hash = location.hash;
  if (!hash.startsWith('#data=')) return false;
  try {
    const encoded = hash.slice(6);
    const json    = decodeURIComponent(atob(encoded));
    const data    = JSON.parse(json);

    // Restore view
    if (data.view) state.map.setView([data.view[0], data.view[1]], data.view[2]);

    // Restore markers & shapes
    const converted = {
      markers: (data.markers || []).map(m => ({ id: uid(), lat: m[0], lng: m[1], title: m[2] || '', desc: m[3] || '' })),
      shapes:  (data.shapes  || []).map(s => ({ id: uid(), type: s[0], coords: s[1] })),
    };
    loadData(converted);
    toast('Map loaded from shared URL!', 'success');
    return true;
  } catch {
    toast('Invalid share URL', 'error');
    return false;
  }
}

/* ═══════════════════════════════════════════════════════════
   15. CLEAR ALL
═══════════════════════════════════════════════════════════ */
function clearAll(silent = false) {
  // Remove markers
  state.clusterGroup.clearLayers();
  state.markers = [];

  // Remove shapes
  state.shapes.forEach(s => state.map.removeLayer(s.leafletLayer));
  state.shapes = [];

  // Clear measure/route
  clearMeasure();
  clearRoute();
  exitMode();

  if (!silent) {
    saveData();
    updateStats();
    toast('Map cleared', 'info');
  }
}

/* ═══════════════════════════════════════════════════════════
   16. MAP LAYERS
═══════════════════════════════════════════════════════════ */
function switchLayer(name) {
  if (!LAYERS[name] || name === state.currentLayer) return;
  state.map.removeLayer(LAYERS[state.currentLayer]);
  LAYERS[name].addTo(state.map);
  state.currentLayer = name;
  document.getElementById('statLayer').textContent = name.toUpperCase();

  document.querySelectorAll('.layer-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.layer === name);
  });
}

/* ═══════════════════════════════════════════════════════════
   17. TOAST
═══════════════════════════════════════════════════════════ */
function toast(msg, type = 'info') {
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.textContent = msg;
  document.getElementById('toastContainer').appendChild(el);
  setTimeout(() => el.remove(), 3200);
}

/* ═══════════════════════════════════════════════════════════
   18. STATS
═══════════════════════════════════════════════════════════ */
function updateStats() {
  document.getElementById('statMarkers').textContent = state.markers.length;
  document.getElementById('statShapes').textContent  = state.shapes.length;
}

/* ═══════════════════════════════════════════════════════════
   19. GEOMETRY HELPERS
═══════════════════════════════════════════════════════════ */
// Haversine distance (meters) between two [lat,lng] pairs
function haversine([lat1, lng1], [lat2, lng2]) {
  const R = 6371000;
  const dLat = rad(lat2 - lat1);
  const dLng = rad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 +
            Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}
const rad = (d) => d * Math.PI / 180;

function computePolylineLength(points) {
  let total = 0;
  for (let i = 1; i < points.length; i++) total += haversine(points[i - 1], points[i]);
  return total;
}

// Spherical excess polygon area (m²)
function computePolygonArea(points) {
  const R = 6371000;
  if (points.length < 3) return 0;
  let area = 0;
  const n = points.length;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    area += rad(points[j][1] - points[i][1]) * (2 + Math.sin(rad(points[i][0])) + Math.sin(rad(points[j][0])));
  }
  return Math.abs(area * R * R / 2);
}

function formatDistance(m) {
  return m >= 1000 ? `${(m / 1000).toFixed(2)} km` : `${Math.round(m)} m`;
}

function formatArea(m2) {
  return m2 >= 1e6 ? `${(m2 / 1e6).toFixed(2)} km²` : `${Math.round(m2)} m²`;
}

/* ═══════════════════════════════════════════════════════════
   20. UTILITIES
═══════════════════════════════════════════════════════════ */
function uid() {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}

function escapeHtml(str) {
  const d = document.createElement('div');
  d.textContent = str;
  return d.innerHTML;
}

function escapeAttr(str) {
  return str.replace(/'/g, "\\'").replace(/"/g, '&quot;');
}

/* ═══════════════════════════════════════════════════════════
   21. SIDEBAR TOGGLE (desktop + mobile)
═══════════════════════════════════════════════════════════ */
function initSidebar() {
  const sidebar = document.getElementById('sidebar');
  const toggle  = document.getElementById('sidebarToggle');
  const isMobile = () => window.innerWidth < 769;

  toggle.addEventListener('click', () => {
    if (isMobile()) {
      sidebar.classList.toggle('mobile-open');
    } else {
      sidebar.classList.toggle('collapsed');
    }
  });

  // Keyboard shortcut: ESC exits mode
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      if (state.mode === 'polyline' && state.drawPoints.length >= 2) finishDrawing('polyline');
      else if (state.mode === 'polygon' && state.drawPoints.length >= 3) finishDrawing('polygon');
      else if (state.mode === 'measure') clearMeasure();
      exitMode();
    }
    // Hotkeys when not typing
    if (document.activeElement.tagName === 'INPUT' || document.activeElement.tagName === 'TEXTAREA') return;
    const hotkeys = { m: 'marker', l: 'polyline', p: 'polygon', d: 'measure', r: 'route' };
    if (hotkeys[e.key.toLowerCase()]) setMode(hotkeys[e.key.toLowerCase()]);
  });
}

/* ═══════════════════════════════════════════════════════════
   22. EVENT BINDING
═══════════════════════════════════════════════════════════ */
function bindEvents() {
  // Mode buttons
  document.getElementById('btnAddMarker').addEventListener('click', () => setMode('marker'));
  document.getElementById('btnDrawPolyline').addEventListener('click', () => setMode('polyline'));
  document.getElementById('btnDrawPolygon').addEventListener('click', () => setMode('polygon'));
  document.getElementById('btnMeasure').addEventListener('click', () => setMode('measure'));
  document.getElementById('btnRoute').addEventListener('click', () => setMode('route'));

  // Exit mode
  document.getElementById('btnExitMode').addEventListener('click', () => {
    if (state.mode === 'polyline' && state.drawPoints.length >= 2) finishDrawing('polyline');
    else if (state.mode === 'polygon' && state.drawPoints.length >= 3) finishDrawing('polygon');
    else exitMode();
  });

  // Tools
  document.getElementById('btnLocate').addEventListener('click', locateUser);
  document.getElementById('btnExport').addEventListener('click', exportData);
  document.getElementById('btnImport').addEventListener('click', triggerImport);
  document.getElementById('importFile').addEventListener('change', handleImport);
  document.getElementById('btnShare').addEventListener('click', shareUrl);
  document.getElementById('btnClear').addEventListener('click', () => {
    if (confirm('Clear all markers and shapes? This cannot be undone.')) clearAll();
  });

  // Route
  document.getElementById('btnCalculateRoute').addEventListener('click', calculateRoute);
  document.getElementById('btnClearRoute').addEventListener('click', clearRoute);

  // Measure
  document.getElementById('btnClearMeasure').addEventListener('click', () => {
    clearMeasure();
    toast('Measurement cleared', 'info');
  });

  // Layers
  document.querySelectorAll('.layer-btn').forEach(btn => {
    btn.addEventListener('click', () => switchLayer(btn.dataset.layer));
  });

  // Modal
  document.getElementById('modalClose').addEventListener('click', closeModal);
  document.getElementById('markerSave').addEventListener('click', saveModal);
  document.getElementById('markerDelete').addEventListener('click', () => {
    if (state.editingMarkerId) {
      deleteMarker(state.editingMarkerId);
      closeModal();
    }
  });
  document.getElementById('modalBackdrop').addEventListener('click', (e) => {
    if (e.target === e.currentTarget) closeModal();
  });

  // Double-click to finish drawing / measure
  state.map.on('dblclick', (e) => {
    L.DomEvent.stop(e);
    if (state.mode === 'polyline') finishDrawing('polyline');
    else if (state.mode === 'polygon') finishDrawing('polygon');
    else if (state.mode === 'measure') {
      const total = computePolylineLength(state.measurePoints);
      toast(`Total distance: ${formatDistance(total)}`, 'success');
    }
  });
}

// Expose edit/delete to global (called from popup HTML)
window.openEditModal = openEditModal;
window.deleteMarker  = deleteMarker;

/* ═══════════════════════════════════════════════════════════
   23. BOOTSTRAP
═══════════════════════════════════════════════════════════ */
document.addEventListener('DOMContentLoaded', () => {
  initMap();
  initSearch();
  initSidebar();
  bindEvents();

  // Load from URL hash first, then localStorage
  const loadedFromUrl = loadFromUrl();
  if (!loadedFromUrl) {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      try { loadData(JSON.parse(saved)); }
      catch { localStorage.removeItem(STORAGE_KEY); }
    }
  }

  updateStats();
  toast('NEXUS MAP ready  ·  press M to add markers', 'info');
});
