export type FocalPoint = {
  x: number;
  y: number;
  confidence: number;
};

const FOCAL_DEFAULT: FocalPoint = { x: 50, y: 50, confidence: 0 };
const FOCAL_TIMEOUT = 5000;

export function detectBrightnessFocal(
  source: HTMLCanvasElement | HTMLImageElement | HTMLVideoElement
): FocalPoint {
  const canvas = document.createElement("canvas");
  const width = 64;
  const height = 48;

  canvas.width = width;
  canvas.height = height;

  const context = canvas.getContext("2d");
  if (!context) {
    return FOCAL_DEFAULT;
  }

  context.drawImage(source, 0, 0, width, height);
  const imageData = context.getImageData(0, 0, width, height);
  const { data } = imageData;
  const gridCols = 3;
  const gridRows = 3;
  const cellW = Math.floor(width / gridCols);
  const cellH = Math.floor(height / gridRows);
  const gridBrightness = new Array(gridCols * gridRows).fill(0);
  const gridCount = new Array(gridCols * gridRows).fill(0);

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const index = (y * width + x) * 4;
      const brightness =
        (data[index] * 0.299) +
        (data[index + 1] * 0.587) +
        (data[index + 2] * 0.114);
      const gridX = Math.min(Math.floor(x / cellW), gridCols - 1);
      const gridY = Math.min(Math.floor(y / cellH), gridRows - 1);
      const gridIndex = (gridY * gridCols) + gridX;
      gridBrightness[gridIndex] += brightness;
      gridCount[gridIndex] += 1;
    }
  }

  let maxAverage = 0;
  let maxIndex = 4;

  for (let index = 0; index < gridBrightness.length; index += 1) {
    const average = gridCount[index] > 0 ? gridBrightness[index] / gridCount[index] : 0;
    if (average > maxAverage) {
      maxAverage = average;
      maxIndex = index;
    }
  }

  const gridX = maxIndex % gridCols;
  const gridY = Math.floor(maxIndex / gridCols);
  const x = ((gridX + 0.5) / gridCols) * 100;
  const y = ((gridY + 0.5) / gridRows) * 100;
  const totalAverage =
    gridBrightness.reduce((sum, value) => sum + value, 0) /
    gridCount.reduce((sum, value) => sum + value, 0);
  const confidence = Math.min(1, Math.max(0.3, (maxAverage - totalAverage) / 128));

  return {
    x: Math.round(x),
    y: Math.round(y),
    confidence
  };
}

function toFileUrl(mediaPath: string): string {
  const rawPath = String(mediaPath ?? "").trim();
  if (!rawPath) {
    return "";
  }
  if (/^file:\/\//i.test(rawPath)) {
    return rawPath;
  }

  let normalizedPath = rawPath.replace(/\\/g, "/");
  if (normalizedPath.startsWith("//")) {
    return encodeURI(`file:${normalizedPath}`)
      .replace(/#/g, "%23")
      .replace(/\?/g, "%3F");
  }
  if (!normalizedPath.startsWith("/")) {
    normalizedPath = `/${normalizedPath}`;
  }

  return encodeURI(`file://${normalizedPath}`)
    .replace(/#/g, "%23")
    .replace(/\?/g, "%3F");
}

export async function detectFocalFromPath(mediaPath: string): Promise<FocalPoint> {
  return new Promise((resolve) => {
    let image: HTMLImageElement | null = null;
    let video: HTMLVideoElement | null = null;
    let timer: number | null = null;
    let resolved = false;

    function cleanup(): void {
      if (timer !== null) {
        window.clearTimeout(timer);
        timer = null;
      }
      if (image) {
        image.onload = null;
        image.onerror = null;
        image = null;
      }
      if (video) {
        video.onloadedmetadata = null;
        video.onseeked = null;
        video.onerror = null;
        try {
          video.pause();
        } catch {
          return;
        } finally {
          try {
            video.removeAttribute("src");
            video.load();
          } catch {
            video = null;
          }
        }
      }
    }

    function done(result: FocalPoint): void {
      if (resolved) {
        return;
      }
      resolved = true;
      cleanup();
      resolve(result);
    }

    timer = window.setTimeout(() => done(FOCAL_DEFAULT), FOCAL_TIMEOUT);

    const mediaUrl = toFileUrl(mediaPath);
    if (!mediaUrl) {
      done(FOCAL_DEFAULT);
      return;
    }

    if (/\.(jpe?g|png|bmp|tiff?|webp|gif)$/i.test(mediaPath)) {
      image = new Image();
      image.onload = () => {
        try {
          done(detectBrightnessFocal(image as HTMLImageElement));
        } catch {
          done(FOCAL_DEFAULT);
        }
      };
      image.onerror = () => done(FOCAL_DEFAULT);
      image.src = mediaUrl;
      return;
    }

    if (/\.(mp4|mov|avi|mkv|webm|m4v)$/i.test(mediaPath)) {
      video = document.createElement("video");
      video.preload = "metadata";
      video.muted = true;

      video.onloadedmetadata = () => {
        const element = video;
        if (!element) {
          done(FOCAL_DEFAULT);
          return;
        }
        try {
          element.currentTime = Math.min(1, Math.max(0, (element.duration || 1) * 0.1));
        } catch {
          done(FOCAL_DEFAULT);
        }
      };
      video.onseeked = () => {
        try {
          done(detectBrightnessFocal(video as HTMLVideoElement));
        } catch {
          done(FOCAL_DEFAULT);
        }
      };
      video.onerror = () => done(FOCAL_DEFAULT);
      video.src = mediaUrl;
      return;
    }

    done(FOCAL_DEFAULT);
  });
}

export async function detectFocalBatch(mediaPaths: string[]): Promise<FocalPoint[]> {
  const results: FocalPoint[] = [];
  for (const mediaPath of mediaPaths) {
    results.push(await detectFocalFromPath(mediaPath));
  }
  return results;
}
