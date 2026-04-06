import { exportPoster } from "./export.js";
import { applyMapStyle, initMap, searchCity, setCanvasFilter } from "./map.js";
import { createStateStore, DEFAULT_STATE, normalizeState } from "./state.js";
import { createUI } from "./ui.js";

async function loadJson(path) {
  const response = await fetch(path);
  if (!response.ok) {
    throw new Error(`Nepavyko užkrauti ${path}`);
  }
  return response.json();
}

async function bootstrap() {
  const [config, presets, printSizes] = await Promise.all([
    loadJson("/data/config.json"),
    loadJson("/data/presets.json"),
    loadJson("/data/printSizes.json")
  ]);

  const stateStore = createStateStore({
    ...DEFAULT_STATE,
    center: config.defaultCenter,
    coords: [config.defaultCenter[1], config.defaultCenter[0]],
    zoom: config.defaultZoom
  });

  const loading = document.getElementById("mapLoading");
  let loaderResolved = false;
  const loadTimeoutId = setTimeout(() => {
    if (loaderResolved) {
      return;
    }
    loaderResolved = true;
    loading.hidden = false;
    loading.innerHTML = "<p>Nepavyko užkrauti žemėlapio. Perkraukite puslapį.</p>";
  }, 12000);

  const resolveLoader = (error) => {
    if (loaderResolved) {
      return;
    }

    loaderResolved = true;
    clearTimeout(loadTimeoutId);

    if (error) {
      loading.hidden = false;
      loading.innerHTML = "<p>Žemėlapio įkelti nepavyko.</p>";
      return;
    }

    loading.hidden = true;
  };

  const map = initMap({
    container: "map",
    state: stateStore.getState(),
    onMoveEnd({ center, coords, zoom }) {
      stateStore.patchState({
        center,
        coords,
        zoom
      });
    },
    onReady(_map, error) {
      resolveLoader(error);
    }
  });

  const mapApi = {
    map,
    lastStyleSignature: "",
    applyState(state) {
      const styleSignature = JSON.stringify({
        lineWidth: state.lineWidth,
        layers: state.layers
      });

      if (styleSignature !== this.lastStyleSignature) {
        this.lastStyleSignature = styleSignature;
        applyMapStyle(map, state);
      }

      setCanvasFilter(map, state);
    },
    async search(query) {
      const result = await searchCity(query, config);
      map.flyTo({
        center: result.center,
        zoom: 13.5,
        essential: true,
        duration: 1400
      });
      return result;
    }
  };

  createUI({
    stateStore,
    mapApi,
    exportPoster,
    presets,
    printSizes,
    config
  });

  const savedState = localStorage.getItem(config.storageKey);
  if (savedState) {
    stateStore.setState(normalizeState(JSON.parse(savedState)));
  } else if (presets[0]) {
    const first = presets[0];
    stateStore.patchState({
      preset: first.id,
      brightness: first.brightness,
      contrast: first.contrast,
      lineWidth: first.lineWidth,
      layers: {
        roads: { ...stateStore.getState().layers.roads, color: first.roads },
        water: { ...stateStore.getState().layers.water, color: first.water },
        buildings: { ...stateStore.getState().layers.buildings, color: first.buildings },
        background: { ...stateStore.getState().layers.background, color: first.background }
      }
    });
  }

  mapApi.applyState(stateStore.getState());
}

bootstrap().catch((error) => {
  void error;
  const loading = document.getElementById("mapLoading");
  loading.hidden = false;
  loading.innerHTML = "<p>Nepavyko paleisti aplikacijos.</p>";
});
