const EXPORT_FORMATS = {
  vertical: { w: 2480, h: 3508, label: "Vertikalus" },
  horizontal: { w: 3508, h: 2480, label: "Horizontalus" },
  square: { w: 3000, h: 3000, label: "Kvadratas" }
};

const RESOLUTION_PRESETS = {
  "1x": 1,
  "2x": 2,
  "4x": 4,
  custom: 2
};

const DEFAULT_STATE = {
  center: [23.9036, 54.8985],
  zoom: 12.5,
  cityName: "KAUNAS",
  coords: [54.8985, 23.9036],
  preset: "atlas",
  title: "ATLAS",
  subtitle: "MIESTO PLAKATO GENERATORIUS",
  layout: "vertical",
  printSize: "A4",
  resolution: "2x",
  customResolution: 2,
  brightness: 100,
  contrast: 104,
  watermarkEnabled: false,
  watermarkText: "atlas.sys32.lt",
  watermarkPosition: "right",
  layers: {
    roads: { visible: true, color: "#f2c94c" },
    water: { visible: true, color: "#183d5d" },
    buildings: { visible: true, color: "#11161d" },
    background: { visible: true, color: "#050608" }
  },
  lineWidth: 2.2
};

function deepClone(value) {
  return JSON.parse(JSON.stringify(value));
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function formatCoordinates(lat, lng) {
  const latText = `${Math.abs(lat).toFixed(4)}° ${lat >= 0 ? "N" : "S"}`;
  const lngText = `${Math.abs(lng).toFixed(4)}° ${lng >= 0 ? "E" : "W"}`;
  return `${latText} · ${lngText}`;
}

function getResolutionMultiplier(state) {
  if (state.resolution === "custom") {
    return clamp(Number(state.customResolution) || 1, 1, 8);
  }

  return RESOLUTION_PRESETS[state.resolution] ?? 2;
}

function getAspectRatio(layout) {
  const format = EXPORT_FORMATS[layout] ?? EXPORT_FORMATS.vertical;
  return `${format.w} / ${format.h}`;
}

function getExportDimensions(state, printSizes) {
  const printSize = printSizes[state.printSize];

  if (printSize) {
    if (state.layout === "horizontal") {
      return {
        width: Math.round(printSize.height),
        height: Math.round(printSize.width)
      };
    }

    if (state.layout === "square") {
      const square = Math.min(printSize.width, printSize.height);
      return {
        width: Math.round(square),
        height: Math.round(square)
      };
    }

    return {
      width: Math.round(printSize.width),
      height: Math.round(printSize.height)
    };
  }

  const multiplier = getResolutionMultiplier(state);
  const format = EXPORT_FORMATS[state.layout] ?? EXPORT_FORMATS.vertical;
  return {
    width: Math.round(format.w * multiplier),
    height: Math.round(format.h * multiplier)
  };
}

function normalizeState(partialState, defaults = DEFAULT_STATE) {
  const merged = {
    ...deepClone(defaults),
    ...deepClone(partialState || {})
  };

  merged.layers = {
    ...deepClone(defaults.layers),
    ...deepClone(partialState?.layers || {})
  };

  merged.layers.roads = { ...defaults.layers.roads, ...(partialState?.layers?.roads || {}) };
  merged.layers.water = { ...defaults.layers.water, ...(partialState?.layers?.water || {}) };
  merged.layers.buildings = { ...defaults.layers.buildings, ...(partialState?.layers?.buildings || {}) };
  merged.layers.background = { ...defaults.layers.background, ...(partialState?.layers?.background || {}) };

  merged.contrast = clamp(Number(merged.contrast) || defaults.contrast, 90, 110);
  merged.brightness = clamp(Number(merged.brightness) || defaults.brightness, 85, 115);
  merged.lineWidth = clamp(Number(merged.lineWidth) || defaults.lineWidth, 0.6, 6);
  merged.customResolution = clamp(Number(merged.customResolution) || defaults.customResolution, 1, 8);
  merged.watermarkEnabled = Boolean(merged.watermarkEnabled);
  merged.title = String(merged.title ?? defaults.title);
  merged.subtitle = String(merged.subtitle ?? defaults.subtitle);
  merged.watermarkText = String(merged.watermarkText ?? defaults.watermarkText);
  merged.cityName = String(merged.cityName ?? defaults.cityName).toUpperCase();

  if (!Array.isArray(merged.center) || merged.center.length !== 2) {
    merged.center = deepClone(defaults.center);
  }

  if (!Array.isArray(merged.coords) || merged.coords.length !== 2) {
    merged.coords = deepClone(defaults.coords);
  }

  return merged;
}

function createStateStore(initialState) {
  let currentState = normalizeState(initialState);
  const subscribers = new Set();

  function notify() {
    subscribers.forEach((subscriber) => subscriber(currentState));
  }

  return {
    getState() {
      return currentState;
    },
    setState(nextState) {
      currentState = normalizeState(nextState, DEFAULT_STATE);
      notify();
    },
    patchState(patch) {
      this.setState({
        ...currentState,
        ...patch,
        layers: {
          ...currentState.layers,
          ...(patch.layers || {})
        }
      });
    },
    subscribe(subscriber) {
      subscribers.add(subscriber);
      subscriber(currentState);
      return () => subscribers.delete(subscriber);
    }
  };
}

export {
  DEFAULT_STATE,
  EXPORT_FORMATS,
  RESOLUTION_PRESETS,
  clamp,
  createStateStore,
  formatCoordinates,
  getAspectRatio,
  getExportDimensions,
  getResolutionMultiplier,
  normalizeState
};
