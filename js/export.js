import { clamp, getExportDimensions } from "./state.js";
import { waitForMapIdle } from "./map.js";

function drawCoverImage(ctx, image, targetWidth, targetHeight) {
  const sourceWidth = image.width;
  const sourceHeight = image.height;
  const sourceRatio = sourceWidth / sourceHeight;
  const targetRatio = targetWidth / targetHeight;

  let sx = 0;
  let sy = 0;
  let sw = sourceWidth;
  let sh = sourceHeight;

  if (sourceRatio > targetRatio) {
    sw = sourceHeight * targetRatio;
    sx = (sourceWidth - sw) / 2;
  } else if (sourceRatio < targetRatio) {
    sh = sourceWidth / targetRatio;
    sy = (sourceHeight - sh) / 2;
  }

  ctx.drawImage(image, sx, sy, sw, sh, 0, 0, targetWidth, targetHeight);
}

function drawWatermark(ctx, state, width, height, config) {
  if (!state.watermarkEnabled || !state.watermarkText.trim()) {
    return;
  }

  const margin = Math.max(48, Math.round(width * 0.03));
  const fontSize = Math.max(28, Math.round(width * 0.016));
  const alpha = clamp(config.defaultWatermarkOpacity ?? 0.58, 0.4, 0.7);
  const x = state.watermarkPosition === "left" ? margin : width - margin;
  const y = height - margin;

  ctx.save();
  ctx.filter = "none";
  ctx.globalAlpha = alpha;
  ctx.font = `600 ${fontSize}px "DM Sans", sans-serif`;
  ctx.textAlign = state.watermarkPosition === "left" ? "left" : "right";
  ctx.textBaseline = "bottom";
  ctx.fillStyle = "#ffffff";
  ctx.fillText(state.watermarkText.trim(), x, y);
  ctx.restore();
}

async function captureOverlayCanvas(overlayElement, exportScale) {
  return html2canvas(overlayElement, {
    backgroundColor: null,
    useCORS: true,
    scale: exportScale,
    logging: false,
    imageTimeout: 15000,
    scrollX: 0,
    scrollY: 0,
    onclone(clonedDocument) {
      clonedDocument.querySelectorAll("[data-export-ignore='true']").forEach((node) => {
        node.style.visibility = "hidden";
      });
    }
  });
}

function downloadCanvas(canvas, filename) {
  const link = document.createElement("a");
  link.download = filename;
  link.href = canvas.toDataURL("image/png", 1);
  link.click();
}

async function exportPoster({ map, state, overlayElement, mapElement, printSizes, config }) {
  try {
    await waitForMapIdle(map);

    const mapCanvas = map.getCanvas();
    const mapWidth = mapElement.clientWidth;
    if (!mapCanvas || !mapWidth) {
      return false;
    }

    const exportScale = mapCanvas.width / mapWidth;
    const overlayCanvas = await captureOverlayCanvas(overlayElement, exportScale);
    const { width, height } = getExportDimensions(state, printSizes);
    const finalCanvas = document.createElement("canvas");
    finalCanvas.width = width;
    finalCanvas.height = height;

    const ctx = finalCanvas.getContext("2d");
    if (!ctx) {
      return false;
    }

    const brightness = clamp(state.brightness, 85, 115);
    const contrast = clamp(state.contrast, 90, 110);

    ctx.fillStyle = state.layers.background.visible ? state.layers.background.color : "#000000";
    ctx.fillRect(0, 0, width, height);

    ctx.save();
    ctx.filter = `brightness(${brightness}%) contrast(${contrast}%)`;
    drawCoverImage(ctx, mapCanvas, width, height);
    ctx.restore();

    ctx.save();
    ctx.filter = "none";
    ctx.drawImage(
      overlayCanvas,
      0,
      0,
      Math.min(overlayCanvas.width, mapCanvas.width),
      Math.min(overlayCanvas.height, mapCanvas.height),
      0,
      0,
      width,
      height
    );
    ctx.restore();

    // Watermark is always drawn after filters to keep color and opacity stable.
    drawWatermark(ctx, state, width, height, config);

    const slug = (state.cityName || "atlas").toLowerCase().replace(/\s+/g, "-");
    downloadCanvas(finalCanvas, `atlas-${slug}-${Date.now()}.png`);
    return true;
  } catch {
    return false;
  }
}

export { exportPoster };
