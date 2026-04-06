import { clamp } from "./state.js";

const VECTOR_TILES_URL = "https://demotiles.maplibre.org/tiles/tiles.json";
const SEARCH_TIMEOUT_MS = 9000;

function adjustBrightness(hex, amount) {
  const clean = hex.replace("#", "");
  const num = parseInt(clean, 16);
  const r = Math.min(255, Math.max(0, (num >> 16) + amount));
  const g = Math.min(255, Math.max(0, ((num >> 8) & 255) + amount));
  const b = Math.min(255, Math.max(0, (num & 255) + amount));
  return `#${[r, g, b].map((value) => value.toString(16).padStart(2, "0")).join("")}`;
}

function buildStyle(state) {
  const roadsWidth = state.lineWidth;

  return {
    version: 8,
    glyphs: "https://fonts.openmaptiles.org/{fontstack}/{range}.pbf",
    sources: {
      openmaptiles: {
        type: "vector",
        url: VECTOR_TILES_URL,
        attribution: "© OpenMapTiles © OpenStreetMap contributors"
      }
    },
    layers: [
      {
        id: "atlas-background",
        type: "background",
        paint: {
          "background-color": state.layers.background.visible ? state.layers.background.color : "#000000"
        }
      },
      {
        id: "atlas-water",
        type: "fill",
        source: "openmaptiles",
        "source-layer": "water",
        paint: {
          "fill-color": state.layers.water.color,
          "fill-opacity": state.layers.water.visible ? 1 : 0
        }
      },
      {
        id: "atlas-waterway",
        type: "line",
        source: "openmaptiles",
        "source-layer": "waterway",
        paint: {
          "line-color": state.layers.water.color,
          "line-width": roadsWidth * 0.85,
          "line-opacity": state.layers.water.visible ? 0.85 : 0
        }
      },
      {
        id: "atlas-building-fill",
        type: "fill",
        source: "openmaptiles",
        "source-layer": "building",
        paint: {
          "fill-color": state.layers.buildings.color,
          "fill-opacity": state.layers.buildings.visible ? 0.95 : 0
        }
      },
      {
        id: "atlas-building-outline",
        type: "line",
        source: "openmaptiles",
        "source-layer": "building",
        paint: {
          "line-color": adjustBrightness(state.layers.buildings.color, 24),
          "line-width": 0.65,
          "line-opacity": state.layers.buildings.visible ? 0.45 : 0
        }
      },
      {
        id: "atlas-road-base",
        type: "line",
        source: "openmaptiles",
        "source-layer": "transportation",
        filter: ["all", ["!=", "class", "path"], ["!=", "class", "ferry"]],
        layout: { "line-cap": "round", "line-join": "round" },
        paint: {
          "line-color": state.layers.roads.color,
          "line-width": [
            "interpolate", ["linear"], ["zoom"],
            8, roadsWidth * 0.35,
            12, roadsWidth * 1.1,
            16, roadsWidth * 2.6
          ],
          "line-opacity": state.layers.roads.visible ? 0.75 : 0
        }
      },
      {
        id: "atlas-road-main",
        type: "line",
        source: "openmaptiles",
        "source-layer": "transportation",
        filter: ["in", "class", "motorway", "trunk", "primary", "secondary", "tertiary"],
        layout: { "line-cap": "round", "line-join": "round" },
        paint: {
          "line-color": state.layers.roads.color,
          "line-width": [
            "interpolate", ["linear"], ["zoom"],
            8, roadsWidth * 0.55,
            12, roadsWidth * 1.45,
            16, roadsWidth * 3.8
          ],
          "line-opacity": state.layers.roads.visible ? 1 : 0
        }
      }
    ]
  };
}

function setCanvasFilter(map, state) {
  const canvas = map?.getCanvas();
  if (!canvas) {
    return;
  }

  canvas.style.filter = `brightness(${clamp(state.brightness, 85, 115)}%) contrast(${clamp(state.contrast, 90, 110)}%)`;
}

function applyMapStyle(map, state) {
  if (!map) {
    return;
  }

  try {
    map.setStyle(buildStyle(state));
  } catch {
    // Keep UI responsive even if style update fails.
  }
}

async function waitForMapIdle(map) {
  if (!map) {
    return;
  }

  await new Promise((resolve) => {
    let settled = false;

    const finish = () => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timer);
      resolve();
    };

    const timer = setTimeout(finish, 4500);
    map.once("idle", finish);
    map.triggerRepaint();
  });

  await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
}

async function searchCity(query, config) {
  const params = new URLSearchParams({
    q: query,
    format: "json",
    limit: "1",
    addressdetails: "1"
  });

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), SEARCH_TIMEOUT_MS);
  let response;

  try {
    response = await fetch(`${config.nominatimUrl}?${params.toString()}`, {
      headers: {
        "Accept-Language": "lt,en"
      },
      signal: controller.signal
    });
  } catch (error) {
    if (error?.name === "AbortError") {
      throw new Error("SEARCH_TIMEOUT");
    }
    throw new Error("SEARCH_FAILED");
  } finally {
    clearTimeout(timeoutId);
  }

  if (!response.ok) {
    throw new Error("SEARCH_FAILED");
  }

  const results = await response.json();

  if (!Array.isArray(results) || results.length === 0) {
    throw new Error("NOT_FOUND");
  }

  const place = results[0];
  const lat = Number(place.lat);
  const lng = Number(place.lon);
  const cityName = String(place.display_name?.split(",")[0] || query).trim().toUpperCase();

  return {
    cityName,
    center: [lng, lat],
    coords: [lat, lng],
    subtitle: place.display_name?.split(",").slice(0, 3).join(" · ") || cityName
  };
}

function initMap({ container, state, onMoveEnd, onReady }) {
  let didResolveReady = false;

  const resolveReady = (error) => {
    if (didResolveReady) {
      return;
    }
    didResolveReady = true;
    onReady?.(map, error);
  };

  const map = new maplibregl.Map({
    container,
    style: buildStyle(state),
    center: state.center,
    zoom: state.zoom,
    attributionControl: false,
    logoPosition: "bottom-right",
    antialias: true,
    preserveDrawingBuffer: true,
    failIfMajorPerformanceCaveat: false
  });

  map.on("load", () => {
    setCanvasFilter(map, state);
    resolveReady();
  });

  map.on("moveend", () => {
    const center = map.getCenter();
    onMoveEnd?.({
      center: [center.lng, center.lat],
      coords: [center.lat, center.lng],
      zoom: map.getZoom()
    });
  });

  map.on("error", (event) => {
    // Avoid false positives from transient style warnings during startup.
    setTimeout(() => {
      if (!map.loaded()) {
        resolveReady(event?.error || new Error("MAP_ERROR"));
      }
    }, 1200);
  });

  return map;
}

export {
  applyMapStyle,
  initMap,
  searchCity,
  setCanvasFilter,
  waitForMapIdle
};
