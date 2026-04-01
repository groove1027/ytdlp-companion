/**
 * Motion Master — Focal Point Detector
 * 이미지에서 피사체/얼굴 위치를 감지하여 앵커 포인트를 자동 설정한다.
 *
 * Level 1: 밝기 히스토그램 기반 (API 불필요, 즉시)
 * Level 2: ONNX BlazeFace 모델 (API 불필요, 2MB 내장) — 추후 통합
 * Level 3: OpenAI Vision API (옵션, 사용자 API 키 필요)
 */

// ═══ Level 1: 밝기 기반 포컬 포인트 ═══

/**
 * 이미지의 밝기 분포를 분석하여 가장 밝은 영역의 중심을 포컬 포인트로 반환한다.
 * 사진에서 피사체는 대체로 밝은 영역에 위치한다는 휴리스틱.
 *
 * @param {HTMLCanvasElement|HTMLImageElement|HTMLVideoElement} source - 이미지 소스
 * @returns {{x: number, y: number, confidence: number}} 좌표 (0-100%), 신뢰도 (0-1)
 */
export function detectBrightnessFocal(source) {
  const canvas = document.createElement('canvas');
  // 분석용 작은 해상도 (성능)
  const w = 64;
  const h = 48;
  canvas.width = w;
  canvas.height = h;

  const ctx = canvas.getContext('2d');
  ctx.drawImage(source, 0, 0, w, h);
  const imageData = ctx.getImageData(0, 0, w, h);
  const data = imageData.data;

  // 3x3 그리드로 밝기 합산
  const gridCols = 3;
  const gridRows = 3;
  const cellW = Math.floor(w / gridCols);
  const cellH = Math.floor(h / gridRows);
  const gridBrightness = new Array(gridCols * gridRows).fill(0);
  const gridCount = new Array(gridCols * gridRows).fill(0);

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const idx = (y * w + x) * 4;
      const brightness = data[idx] * 0.299 + data[idx + 1] * 0.587 + data[idx + 2] * 0.114;
      const gx = Math.min(Math.floor(x / cellW), gridCols - 1);
      const gy = Math.min(Math.floor(y / cellH), gridRows - 1);
      const gi = gy * gridCols + gx;
      gridBrightness[gi] += brightness;
      gridCount[gi]++;
    }
  }

  // 평균 밝기가 가장 높은 셀 찾기
  let maxAvg = 0;
  let maxIdx = 4; // 기본: 중앙
  for (let i = 0; i < gridBrightness.length; i++) {
    const avg = gridCount[i] > 0 ? gridBrightness[i] / gridCount[i] : 0;
    if (avg > maxAvg) {
      maxAvg = avg;
      maxIdx = i;
    }
  }

  // 셀 인덱스 → 좌표 (%)
  const gx = maxIdx % gridCols;
  const gy = Math.floor(maxIdx / gridCols);
  const x = ((gx + 0.5) / gridCols) * 100;
  const y = ((gy + 0.5) / gridRows) * 100;

  // 신뢰도: 최대 밝기와 평균 밝기의 차이 비율
  const totalAvg = gridBrightness.reduce((a, b) => a + b, 0) /
                   gridCount.reduce((a, b) => a + b, 0);
  const confidence = Math.min(1, Math.max(0.3, (maxAvg - totalAvg) / 128));

  return { x: Math.round(x), y: Math.round(y), confidence };
}

// ═══ 클립 썸네일 추출 ═══

/**
 * 클립의 미디어 파일 경로에서 썸네일을 추출한다.
 * CEP 패널에서 file:// 프로토콜로 로드.
 *
 * @param {string} mediaPath - 미디어 파일 경로
 * @returns {Promise<{x, y, confidence}>} 포컬 포인트
 */
export async function detectFocalFromPath(mediaPath) {
  return new Promise((resolve) => {
    // 이미지 파일인 경우
    if (/\.(jpe?g|png|bmp|tiff?|webp|gif)$/i.test(mediaPath)) {
      const img = new Image();
      img.onload = () => resolve(detectBrightnessFocal(img));
      img.onerror = () => resolve({ x: 50, y: 50, confidence: 0 });
      img.src = 'file:///' + mediaPath.replace(/\\/g, '/');
      return;
    }

    // 동영상 파일인 경우 — 1초 지점 프레임 캡처
    if (/\.(mp4|mov|avi|mkv|webm|m4v)$/i.test(mediaPath)) {
      const video = document.createElement('video');
      video.preload = 'metadata';
      video.muted = true;

      video.onloadeddata = () => {
        video.currentTime = Math.min(1, video.duration * 0.1);
      };
      video.onseeked = () => {
        resolve(detectBrightnessFocal(video));
      };
      video.onerror = () => resolve({ x: 50, y: 50, confidence: 0 });
      video.src = 'file:///' + mediaPath.replace(/\\/g, '/');
      return;
    }

    // 알 수 없는 형식
    resolve({ x: 50, y: 50, confidence: 0 });
  });
}

/**
 * 여러 클립의 포컬 포인트를 배치 감지한다.
 *
 * @param {string[]} mediaPaths - 미디어 파일 경로 배열
 * @returns {Promise<Array<{x, y, confidence}>>}
 */
export async function detectFocalBatch(mediaPaths) {
  const results = [];
  for (const path of mediaPaths) {
    const focal = await detectFocalFromPath(path);
    results.push(focal);
  }
  return results;
}
