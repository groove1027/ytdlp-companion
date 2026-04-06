import { PRESET_DEFS, type MotionFrame, type PresetId } from "./presets";

export function calcFrameCoverageScale(
  frame: MotionFrame,
  anchorX = 50,
  anchorY = 50,
  intensity = 1,
  seqW = 1920,
  seqH = 1080
): number {
  const width = typeof seqW === "number" && seqW > 0 ? seqW : 1920;
  const height = typeof seqH === "number" && seqH > 0 ? seqH : 1080;
  const dx = (((frame.tx * intensity) + (50 - anchorX)) / 100) * width;
  const dy = (((frame.ty * intensity) + (50 - anchorY)) / 100) * height;
  const rotationRad = Math.abs(frame.r * intensity) * Math.PI / 180;
  const cosT = Math.cos(rotationRad);
  const sinT = Math.sin(rotationRad);
  const halfW = width / 2;
  const halfH = height / 2;
  let requiredScale = 1;
  const corners: Array<[number, number]> = [
    [-1, -1],
    [1, -1],
    [1, 1],
    [-1, 1]
  ];

  for (const [cornerX, cornerY] of corners) {
    const px = (cornerX * halfW) - dx;
    const py = (cornerY * halfH) - dy;
    const qx = (px * cosT) + (py * sinT);
    const qy = (-px * sinT) + (py * cosT);
    const scaleX = Math.abs(qx) / halfW;
    const scaleY = Math.abs(qy) / halfH;

    if (scaleX > requiredScale) {
      requiredScale = scaleX;
    }
    if (scaleY > requiredScale) {
      requiredScale = scaleY;
    }
  }

  return requiredScale * 1.05;
}

export function calcOverscale(
  presetId: PresetId,
  seqW = 1920,
  seqH = 1080,
  anchorX = 50,
  anchorY = 50,
  intensity = 1
): number {
  const preset = PRESET_DEFS[presetId];
  if (!preset) {
    return 1.05;
  }

  let maxCoverage = 1.05;
  for (const frame of preset.frames) {
    const coverage = calcFrameCoverageScale(frame, anchorX, anchorY, intensity, seqW, seqH);
    if (coverage > maxCoverage) {
      maxCoverage = coverage;
    }
  }

  return maxCoverage;
}
