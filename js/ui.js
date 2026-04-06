import {
  EXPORT_FORMATS,
  clamp,
  formatCoordinates,
  getAspectRatio,
  normalizeState
} from "./state.js";

function getRandomColor() {
  const palette = ["#f2c94c", "#7dd3fc", "#ff8a5b", "#73e2a7", "#f28482", "#a78bfa", "#f7b267", "#8bd3dd"];
  return palette[Math.floor(Math.random() * palette.length)];
}

function applyPresetToState(state, preset) {
  return normalizeState({
    ...state,
    preset: preset.id,
    brightness: preset.brightness,
    contrast: preset.contrast,
    lineWidth: preset.lineWidth,
    layers: {
      ...state.layers,
      roads: { ...state.layers.roads, color: preset.roads },
      water: { ...state.layers.water, color: preset.water },
      buildings: { ...state.layers.buildings, color: preset.buildings },
      background: { ...state.layers.background, color: preset.background }
    }
  });
}

function renderPresetButtons(container, presets) {
  container.innerHTML = presets.map((preset, index) => `
    <button class="preset-btn btn ${index === 0 ? "active" : ""}" type="button" data-preset="${preset.id}">
      <span class="preset-swatch" style="background: linear-gradient(135deg, ${preset.background} 50%, ${preset.roads} 50%)"></span>
      <span>${preset.label}</span>
    </button>
  `).join("");
}

function renderSelectOptions(select, options) {
  select.innerHTML = options.map((option) => `<option value="${option.value}">${option.label}</option>`).join("");
}

function updateOverlay(state, elements) {
  elements.posterSurface.style.setProperty("--poster-ratio", getAspectRatio(state.layout));
  elements.posterTitle.textContent = state.title.trim() || "ATLAS";
  elements.posterSubtitle.textContent = state.subtitle.trim() || "MIESTO PLAKATO GENERATORIUS";
  elements.cityName.textContent = state.cityName.trim() || "MIESTAS";
  elements.cityCoords.textContent = formatCoordinates(state.coords[0], state.coords[1]);
  elements.previewWatermark.textContent = state.watermarkText.trim();
  elements.previewWatermark.hidden = !state.watermarkEnabled || !state.watermarkText.trim();
}

function syncControls(state, elements) {
  elements.titleInput.value = state.title;
  elements.subtitleInput.value = state.subtitle;
  elements.colorRoads.value = state.layers.roads.color;
  elements.colorWater.value = state.layers.water.color;
  elements.colorBuildings.value = state.layers.buildings.color;
  elements.colorBackground.value = state.layers.background.color;
  elements.toggleRoads.checked = state.layers.roads.visible;
  elements.toggleWater.checked = state.layers.water.visible;
  elements.toggleBuildings.checked = state.layers.buildings.visible;
  elements.toggleBackground.checked = state.layers.background.visible;
  elements.lineWidth.value = String(state.lineWidth);
  elements.lineWidthVal.textContent = state.lineWidth.toFixed(1);
  elements.brightness.value = String(state.brightness);
  elements.brightnessVal.textContent = `${state.brightness}%`;
  elements.contrast.value = String(state.contrast);
  elements.contrastVal.textContent = `${state.contrast}%`;
  elements.layoutSelect.value = state.layout;
  elements.resolutionSelect.value = state.resolution;
  elements.printSizeSelect.value = state.printSize;
  elements.customResolution.value = String(state.customResolution);
  elements.watermarkToggle.checked = state.watermarkEnabled;
  elements.watermarkInput.value = state.watermarkText;
  elements.watermarkPosition.value = state.watermarkPosition;
  elements.customResolutionWrap.hidden = state.resolution !== "custom";
}

function createUI({
  stateStore,
  mapApi,
  exportPoster,
  presets,
  printSizes,
  config
}) {
  const elements = {
    posterSurface: document.getElementById("posterSurface"),
    overlayCapture: document.getElementById("overlayCapture"),
    posterTitle: document.getElementById("posterTitle"),
    posterSubtitle: document.getElementById("posterSubtitle"),
    cityName: document.getElementById("cityNameDisplay"),
    cityCoords: document.getElementById("cityCoords"),
    previewWatermark: document.getElementById("previewWatermark"),
    cityInput: document.getElementById("cityInput"),
    searchBtn: document.getElementById("searchBtn"),
    searchHint: document.getElementById("searchHint"),
    presets: document.getElementById("presetGrid"),
    titleInput: document.getElementById("titleInput"),
    subtitleInput: document.getElementById("subtitleInput"),
    colorRoads: document.getElementById("colorRoads"),
    colorWater: document.getElementById("colorWater"),
    colorBuildings: document.getElementById("colorBuildings"),
    colorBackground: document.getElementById("colorBackground"),
    toggleRoads: document.getElementById("toggleRoads"),
    toggleWater: document.getElementById("toggleWater"),
    toggleBuildings: document.getElementById("toggleBuildings"),
    toggleBackground: document.getElementById("toggleBackground"),
    lineWidth: document.getElementById("lineWidth"),
    lineWidthVal: document.getElementById("lineWidthVal"),
    brightness: document.getElementById("brightness"),
    brightnessVal: document.getElementById("brightnessVal"),
    contrast: document.getElementById("contrast"),
    contrastVal: document.getElementById("contrastVal"),
    layoutSelect: document.getElementById("layoutSelect"),
    resolutionSelect: document.getElementById("resolutionSelect"),
    printSizeSelect: document.getElementById("printSizeSelect"),
    customResolution: document.getElementById("customResolution"),
    customResolutionWrap: document.getElementById("customResolutionWrap"),
    watermarkToggle: document.getElementById("watermarkToggle"),
    watermarkInput: document.getElementById("watermarkInput"),
    watermarkPosition: document.getElementById("watermarkPosition"),
    randomizeBtn: document.getElementById("randomizeBtn"),
    saveBtn: document.getElementById("saveBtn"),
    loadBtn: document.getElementById("loadBtn"),
    exportBtn: document.getElementById("exportBtn"),
    zoomIn: document.getElementById("zoomIn"),
    zoomOut: document.getElementById("zoomOut"),
    mobileToggle: document.getElementById("mobileToggle"),
    sidebar: document.getElementById("sidebar")
  };

  renderPresetButtons(elements.presets, presets);
  renderSelectOptions(elements.layoutSelect, Object.entries(EXPORT_FORMATS).map(([value, format]) => ({ value, label: format.label })));
  renderSelectOptions(elements.resolutionSelect, [
    { value: "1x", label: "1x" },
    { value: "2x", label: "2x" },
    { value: "4x", label: "4x" },
    { value: "custom", label: "Pasirinktinis" }
  ]);
  renderSelectOptions(elements.printSizeSelect, [
    { value: "none", label: "Tik maketas" },
    ...Object.entries(printSizes).map(([value, item]) => ({ value, label: item.label }))
  ]);

  stateStore.subscribe((state) => {
    syncControls(state, elements);
    updateOverlay(state, elements);
    elements.presets.querySelectorAll(".preset-btn").forEach((button) => {
      button.classList.toggle("active", button.dataset.preset === state.preset);
    });
  });

  function patchState(patch) {
    stateStore.patchState(patch);
    mapApi.applyState(stateStore.getState());
  }

  elements.presets.addEventListener("click", (event) => {
    const button = event.target.closest(".preset-btn");
    if (!button) {
      return;
    }

    const preset = presets.find((item) => item.id === button.dataset.preset);
    if (!preset) {
      return;
    }

    stateStore.setState(applyPresetToState(stateStore.getState(), preset));
    mapApi.applyState(stateStore.getState());
  });

  elements.searchBtn.addEventListener("click", async () => {
    const query = elements.cityInput.value.trim();
    if (!query) {
      return;
    }

    elements.searchBtn.disabled = true;
    elements.searchHint.textContent = "Ieškoma...";
    elements.searchHint.dataset.state = "";

    try {
      const result = await mapApi.search(query);
      patchState({
        cityName: result.cityName,
        center: result.center,
        coords: result.coords,
        subtitle: stateStore.getState().subtitle.trim() ? stateStore.getState().subtitle : result.subtitle
      });
      elements.cityInput.value = result.cityName;
      elements.searchHint.textContent = `Rasta: ${result.cityName}`;
      elements.searchHint.dataset.state = "success";
    } catch (error) {
      elements.searchHint.textContent = error.message === "NOT_FOUND" ? "Miestas nerastas." : "Nepavyko užkrauti paieškos.";
      elements.searchHint.dataset.state = "error";
    } finally {
      elements.searchBtn.disabled = false;
    }
  });

  elements.cityInput.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      elements.searchBtn.click();
    }
  });

  elements.titleInput.addEventListener("input", (event) => patchState({ title: event.target.value }));
  elements.subtitleInput.addEventListener("input", (event) => patchState({ subtitle: event.target.value }));
  elements.lineWidth.addEventListener("input", (event) => patchState({ lineWidth: Number(event.target.value) }));
  elements.brightness.addEventListener("input", (event) => patchState({ brightness: clamp(Number(event.target.value), 85, 115) }));
  elements.contrast.addEventListener("input", (event) => patchState({ contrast: clamp(Number(event.target.value), 90, 110) }));
  elements.layoutSelect.addEventListener("change", (event) => patchState({ layout: event.target.value }));
  elements.resolutionSelect.addEventListener("change", (event) => patchState({ resolution: event.target.value }));
  elements.printSizeSelect.addEventListener("change", (event) => patchState({ printSize: event.target.value }));
  elements.customResolution.addEventListener("input", (event) => patchState({ customResolution: clamp(Number(event.target.value), 1, 8) }));
  elements.watermarkToggle.addEventListener("change", (event) => patchState({ watermarkEnabled: event.target.checked }));
  elements.watermarkInput.addEventListener("input", (event) => patchState({ watermarkText: event.target.value }));
  elements.watermarkPosition.addEventListener("change", (event) => patchState({ watermarkPosition: event.target.value }));

  [
    ["roads", elements.colorRoads],
    ["water", elements.colorWater],
    ["buildings", elements.colorBuildings],
    ["background", elements.colorBackground]
  ].forEach(([layerKey, element]) => {
    element.addEventListener("input", (event) => patchState({
      layers: {
        [layerKey]: {
          ...stateStore.getState().layers[layerKey],
          color: event.target.value
        }
      }
    }));
  });

  [
    ["roads", elements.toggleRoads],
    ["water", elements.toggleWater],
    ["buildings", elements.toggleBuildings],
    ["background", elements.toggleBackground]
  ].forEach(([layerKey, element]) => {
    element.addEventListener("change", (event) => patchState({
      layers: {
        [layerKey]: {
          ...stateStore.getState().layers[layerKey],
          visible: event.target.checked
        }
      }
    }));
  });

  elements.randomizeBtn.addEventListener("click", () => {
    patchState({
      preset: "custom",
      layers: {
        roads: { ...stateStore.getState().layers.roads, color: getRandomColor() },
        water: { ...stateStore.getState().layers.water, color: getRandomColor() },
        buildings: { ...stateStore.getState().layers.buildings, color: getRandomColor() }
      }
    });
  });

  elements.saveBtn.addEventListener("click", () => {
    localStorage.setItem(config.storageKey, JSON.stringify(stateStore.getState()));
    elements.searchHint.textContent = "Stilius išsaugotas naršyklėje.";
    elements.searchHint.dataset.state = "success";
  });

  elements.loadBtn.addEventListener("click", () => {
    const raw = localStorage.getItem(config.storageKey);
    if (!raw) {
      elements.searchHint.textContent = "Išsaugoto stiliaus nėra.";
      elements.searchHint.dataset.state = "error";
      return;
    }

    stateStore.setState(normalizeState(JSON.parse(raw)));
    mapApi.applyState(stateStore.getState());
    elements.searchHint.textContent = "Išsaugotas stilius atkurtas.";
    elements.searchHint.dataset.state = "success";
  });

  elements.exportBtn.addEventListener("click", async () => {
    elements.exportBtn.disabled = true;
    elements.exportBtn.textContent = "Ruošiama...";

    try {
      await exportPoster({
        map: mapApi.map,
        state: stateStore.getState(),
        overlayElement: elements.overlayCapture,
        mapElement: document.getElementById("map"),
        printSizes,
        config
      });
    } finally {
      elements.exportBtn.disabled = false;
      elements.exportBtn.textContent = "Atsisiųsti PNG";
    }
  });

  elements.zoomIn.addEventListener("click", () => mapApi.map.easeTo({ zoom: mapApi.map.getZoom() + 1, duration: 300 }));
  elements.zoomOut.addEventListener("click", () => mapApi.map.easeTo({ zoom: mapApi.map.getZoom() - 1, duration: 300 }));
  elements.mobileToggle.addEventListener("click", () => elements.sidebar.classList.toggle("open"));
}

export { createUI };
