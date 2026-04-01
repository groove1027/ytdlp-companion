/**
 * Motion Master — ExtendScript Engine for Premiere Pro
 *
 * Premiere Pro의 클립 Motion 프로퍼티에 Ken Burns 키프레임을 적용한다.
 * CEP 패널(client/)에서 CSInterface.evalScript()로 호출됨.
 *
 * ⚠️ ExtendScript = ES3 문법 (var만, arrow function 불가, const/let 불가)
 */

// ═══════════════════════════════════════════════════════════
// 프리셋 정의 — kenBurnsEngine.ts에서 1:1 이식
// ═══════════════════════════════════════════════════════════

var PRESET_DEFS = {
  // ─── 팬/줌 프리셋 (21개) ───
  fast:            { frames: [{s:1,tx:0,ty:0,r:0},{s:1.15,tx:0,ty:0,r:0}],             dur:2, ease:'bezier', alt:true },
  smooth:          { frames: [{s:1,tx:0,ty:0,r:0},{s:1.15,tx:0,ty:0,r:0}],             dur:4, ease:'bezier', alt:true },
  cinematic:       { frames: [{s:1.15,tx:0,ty:0,r:0},{s:1,tx:0,ty:0,r:0}],             dur:5, ease:'bezier', alt:true },
  dynamic:         { frames: [{s:1,tx:-3,ty:-2,r:0},{s:1.1,tx:3,ty:2,r:0},{s:1,tx:-3,ty:-2,r:0}], dur:4, ease:'bezier', alt:false },
  dreamy:          { frames: [{s:1,tx:0,ty:0,r:0},{s:1.08,tx:0,ty:0,r:0.8},{s:1,tx:0,ty:0,r:0}],  dur:6, ease:'bezier', alt:false },
  dramatic:        { frames: [{s:1,tx:0,ty:0,r:0},{s:1.18,tx:0,ty:0,r:0},{s:1,tx:0,ty:0,r:0}],    dur:4, ease:'bezier', alt:false },
  zoom:            { frames: [{s:1,tx:0,ty:0,r:0},{s:1.15,tx:0,ty:0,r:0}],             dur:3, ease:'bezier', alt:true },
  reveal:          { frames: [{s:1.18,tx:0,ty:0,r:0},{s:1,tx:0,ty:0,r:0}],             dur:4, ease:'bezier', alt:true },
  vintage:         { frames: [{s:1,tx:0,ty:0,r:0},{s:1.15,tx:0,ty:0,r:0}],             dur:6, ease:'bezier', alt:true },
  documentary:     { frames: [{s:1,tx:5,ty:0,r:0},{s:1,tx:-5,ty:0,r:0}],               dur:6, ease:'linear', alt:true },
  timelapse:       { frames: [{s:1,tx:-5,ty:0,r:0},{s:1,tx:5,ty:0,r:0}],               dur:2, ease:'linear', alt:true },
  vlog:            { frames: [{s:1,tx:0,ty:0,r:0},{s:1.03,tx:0.08,ty:0.08,r:0},{s:1,tx:0,ty:0,r:0}], dur:3, ease:'bezier', alt:false },
  'diagonal-drift':{ frames: [{s:1,tx:4,ty:-4,r:0},{s:1.06,tx:-4,ty:4,r:0}],           dur:5, ease:'bezier', alt:true },
  orbit:           { frames: [{s:1.05,tx:0,ty:-3,r:0},{s:1.05,tx:3,ty:0,r:0},{s:1.05,tx:0,ty:3,r:0},{s:1.05,tx:-3,ty:0,r:0},{s:1.05,tx:0,ty:-3,r:0}], dur:6, ease:'bezier', alt:false },
  parallax:        { frames: [{s:1,tx:3,ty:0,r:0},{s:1.1,tx:-3,ty:0,r:0}],             dur:5, ease:'bezier', alt:true },
  'tilt-shift':    { frames: [{s:1.05,tx:0,ty:-5,r:0},{s:1.05,tx:0,ty:5,r:0}],         dur:5, ease:'bezier', alt:true },
  'spiral-in':     { frames: [{s:1,tx:0,ty:0,r:0},{s:1.15,tx:0,ty:0,r:3}],             dur:4, ease:'bezier', alt:true },
  'push-pull':     { frames: [{s:1,tx:0,ty:0,r:0},{s:1.12,tx:0,ty:0,r:0},{s:1,tx:0,ty:0,r:0}], dur:3, ease:'bezier', alt:false },
  'dolly-zoom':    { frames: [{s:1.15,tx:0,ty:0,r:0},{s:1,tx:0,ty:0,r:0},{s:1.15,tx:0,ty:0,r:0}], dur:4, ease:'bezier', alt:false },
  'crane-up':      { frames: [{s:1,tx:0,ty:-5,r:0},{s:1.05,tx:0,ty:4,r:0}],            dur:5, ease:'bezier', alt:true },
  noir:            { frames: [{s:1,tx:0,ty:0,r:0},{s:1.15,tx:0,ty:0,r:0}],             dur:5, ease:'bezier', alt:true },

  // ─── 모션 이펙트 프리셋 (9개) ───
  slow:            { frames: [{s:1,tx:0,ty:0,r:0},{s:1.06,tx:0,ty:0,r:0}],             dur:6, ease:'bezier', alt:true },
  rotate:          { frames: [{s:1.05,tx:0,ty:0,r:0},{s:1.05,tx:0,ty:0,r:3}],          dur:4, ease:'bezier', alt:true },
  'rotate-plus':   { frames: [{s:1.08,tx:0,ty:0,r:0},{s:1.08,tx:0,ty:0,r:8}],         dur:3, ease:'bezier', alt:true },
  pan:             { frames: [{s:1,tx:5,ty:0,r:0},{s:1,tx:-5,ty:0,r:0}],               dur:4, ease:'linear', alt:true },
  micro:           { frames: [{s:1,tx:0,ty:0,r:0},{s:1.03,tx:0.08,ty:0.08,r:0},{s:1,tx:0,ty:0,r:0}], dur:3, ease:'bezier', alt:false },
  sepia:           { frames: [{s:1,tx:0,ty:0,r:0},{s:1.15,tx:0,ty:0,r:0}],             dur:8, ease:'bezier', alt:true },
  film:            { frames: [{s:1,tx:0,ty:0,r:0},{s:1.03,tx:0.08,ty:0.08,r:0},{s:1,tx:0,ty:0,r:0}], dur:6, ease:'bezier', alt:false },
  shake:           { frames: [{s:1,tx:0,ty:0,r:0},{s:1,tx:-0.3,ty:0.2,r:0},{s:1,tx:0.3,ty:-0.2,r:0},{s:1,tx:-0.2,ty:0.3,r:0},{s:1,tx:0.2,ty:-0.3,r:0},{s:1,tx:-0.3,ty:-0.2,r:0},{s:1,tx:0,ty:0,r:0}], dur:0.6, ease:'bezier', alt:false },
  glitch:          { frames: [{s:1,tx:0,ty:0,r:0},{s:1,tx:-0.5,ty:0.2,r:0},{s:1,tx:0.5,ty:-0.2,r:0},{s:1,tx:-0.3,ty:-0.3,r:0},{s:1,tx:0.4,ty:0.1,r:0},{s:1,tx:-0.2,ty:0.4,r:0},{s:1,tx:0,ty:0,r:0}], dur:0.3, ease:'linear', alt:false }
};

// ═══════════════════════════════════════════════════════════
// 오버스케일 계산 — 검은 테두리 방지
// ═══════════════════════════════════════════════════════════

/**
 * 프리셋별 필요한 최소 오버스케일을 계산한다.
 * 모든 키프레임의 최대 scale, pan, rotation을 분석하여
 * 이미지가 프레임 밖으로 벗어나지 않는 최소 배율을 반환한다.
 *
 * @param {string} presetId - 프리셋 ID
 * @returns {number} 오버스케일 배율 (예: 1.21 = 121%)
 */
function calcOverscale(presetId) {
  var preset = PRESET_DEFS[presetId];
  if (!preset) return 1.05;

  var maxScale = 0;
  var maxPanX = 0;
  var maxPanY = 0;
  var maxRotate = 0;

  for (var i = 0; i < preset.frames.length; i++) {
    var f = preset.frames[i];
    if (f.s > maxScale) maxScale = f.s;
    if (Math.abs(f.tx) > maxPanX) maxPanX = Math.abs(f.tx);
    if (Math.abs(f.ty) > maxPanY) maxPanY = Math.abs(f.ty);
    if (Math.abs(f.r) > maxRotate) maxRotate = Math.abs(f.r);
  }

  // 회전 시 모서리 벗어남 보정 (1° ≈ 0.6% 추가 마진)
  var rotateMargin = maxRotate > 0 ? (1 + maxRotate * 0.006) : 1;

  // 패닝 거리 보정 (% 기반)
  var panMargin = 1 + (Math.max(maxPanX, maxPanY) / 100);

  // 최종 오버스케일 = 최대 scale × 패닝 마진 × 회전 마진 × 안전 여유 5%
  return maxScale * panMargin * rotateMargin * 1.05;
}

// ═══════════════════════════════════════════════════════════
// Premiere Pro API — 클립 조회
// ═══════════════════════════════════════════════════════════

/**
 * 현재 시퀀스에서 선택된 클립 목록을 JSON으로 반환한다.
 * @returns {string} JSON 배열 — [{name, trackIdx, clipIdx, start, end, dur, isStill, mediaPath}]
 */
function getSelectedClips() {
  try {
    var seq = app.project.activeSequence;
    if (!seq) return JSON.stringify({ error: 'No active sequence' });

    var selection = seq.getSelection();
    if (!selection || selection.length === 0) {
      return JSON.stringify({ error: 'No clips selected' });
    }

    var results = [];
    for (var i = 0; i < selection.length; i++) {
      var clip = selection[i];
      // 비디오 트랙 클립만 처리
      if (!clip || !clip.projectItem) continue;

      var trackIdx = -1;
      var clipIdx = -1;
      // 트랙/클립 인덱스 찾기
      for (var t = 0; t < seq.videoTracks.numTracks; t++) {
        var track = seq.videoTracks[t];
        for (var c = 0; c < track.clips.numItems; c++) {
          if (track.clips[c].name === clip.name &&
              Math.abs(track.clips[c].start.seconds - clip.start.seconds) < 0.01) {
            trackIdx = t;
            clipIdx = c;
            break;
          }
        }
        if (trackIdx >= 0) break;
      }

      results.push({
        name: clip.name,
        trackIdx: trackIdx,
        clipIdx: clipIdx,
        start: clip.start.seconds,
        end: clip.end.seconds,
        dur: clip.end.seconds - clip.start.seconds,
        mediaPath: clip.projectItem.getMediaPath() || ''
      });
    }

    return JSON.stringify(results);
  } catch (e) {
    return JSON.stringify({ error: e.message });
  }
}

// ═══════════════════════════════════════════════════════════
// Premiere Pro API — 키프레임 적용
// ═══════════════════════════════════════════════════════════

/**
 * Premiere Pro Motion 컴포넌트 프로퍼티 인덱스:
 *   components[1] = Motion
 *   Motion.properties:
 *     [0] = Anchor Point    (x, y — 프레임 px)
 *     [1] = Position        (x, y — 프레임 px)
 *     [2] = Scale Height    (0-100+)
 *     [3] = Scale Width     (0-100+)  — ⚠️ Uniform Scale on이면 Scale Height만 적용
 *     [4] = Scale           (0-100+)  — Uniform Scale
 *     [5] = Rotation        (degrees)
 *     [6] = Opacity         (0-100)
 *
 * ⚠️ 프로퍼티 인덱스는 Premiere 버전에 따라 다를 수 있음.
 *    getParamForDisplayName()으로 이름 기반 접근이 더 안전하지만,
 *    로컬라이즈 문제가 있으므로 인덱스 + 이름 폴백 방식을 사용.
 */

/**
 * 단일 클립에 Ken Burns 모션 키프레임을 적용한다.
 *
 * @param {number} trackIdx - 비디오 트랙 인덱스
 * @param {number} clipIdx  - 클립 인덱스
 * @param {string} presetId - 프리셋 ID (예: 'cinematic')
 * @param {number} anchorX  - 앵커 X (0-100, 50=중앙)
 * @param {number} anchorY  - 앵커 Y (0-100, 50=중앙)
 * @param {number} intensity - 강도 (0.5~1.5, 1.0=기본)
 * @returns {string} 결과 메시지
 */
function applyMotionToClip(trackIdx, clipIdx, presetId, anchorX, anchorY, intensity) {
  try {
    var seq = app.project.activeSequence;
    if (!seq) return 'Error: No active sequence';

    var track = seq.videoTracks[trackIdx];
    if (!track) return 'Error: Track ' + trackIdx + ' not found';

    var clip = track.clips[clipIdx];
    if (!clip) return 'Error: Clip ' + clipIdx + ' not found';

    var preset = PRESET_DEFS[presetId];
    if (!preset) return 'Error: Preset "' + presetId + '" not found';

    if (typeof intensity !== 'number' || intensity <= 0) intensity = 1.0;

    // 오버스케일 계산
    var overscale = calcOverscale(presetId);

    // Motion 컴포넌트 찾기
    var motion = null;
    for (var ci = 0; ci < clip.components.numItems; ci++) {
      if (clip.components[ci].displayName === 'Motion' ||
          clip.components[ci].displayName === '모션') {
        motion = clip.components[ci];
        break;
      }
    }
    if (!motion) return 'Error: Motion component not found';

    // 프로퍼티 찾기 (이름 기반 — 다국어 대응)
    var scaleProp = findProp(motion, ['Scale', '비율', 'Échelle', 'Skalierung']);
    var posProp = findProp(motion, ['Position', '위치', 'Posición']);
    var rotProp = findProp(motion, ['Rotation', '회전', 'Drehung']);

    if (!scaleProp) return 'Error: Scale property not found';

    // 클립 시간 범위
    var inTime = clip.inPoint.seconds;
    var outTime = clip.outPoint.seconds;
    var dur = outTime - inTime;

    // 기존 키프레임 제거
    clearKeyframes(scaleProp);
    if (posProp) clearKeyframes(posProp);
    if (rotProp) clearKeyframes(rotProp);

    // 시퀀스 프레임 크기
    var seqW = parseInt(seq.frameSizeHorizontal);
    var seqH = parseInt(seq.frameSizeVertical);
    var centerX = seqW / 2;
    var centerY = seqH / 2;

    // 앵커 기반 위치 오프셋 (50,50이 중앙)
    var anchorOffsetX = (anchorX - 50) / 100 * seqW;
    var anchorOffsetY = (anchorY - 50) / 100 * seqH;

    // 프리셋 키프레임 적용
    var frames = preset.frames;
    var numFrames = frames.length;

    for (var fi = 0; fi < numFrames; fi++) {
      var f = frames[fi];
      var ratio = numFrames > 1 ? fi / (numFrames - 1) : 0;
      var time = inTime + dur * ratio;

      // Scale: 오버스케일 × 프리셋 scale × 강도 → 퍼센트
      var baseScale = overscale * 100;
      var presetScale = f.s;
      // intensity 적용: 1.0에서의 편차만큼 강도 조절
      var scaleDelta = (presetScale - 1.0) * intensity;
      var finalScale = baseScale * (1.0 + scaleDelta);
      scaleProp.setValueAtKey(time, finalScale);

      // Position: 앵커 오프셋 + 패닝 (% → px 변환)
      if (posProp) {
        var panPixelX = (f.tx / 100) * seqW * overscale * intensity;
        var panPixelY = (f.ty / 100) * seqH * overscale * intensity;
        var posArray = [
          centerX + anchorOffsetX + panPixelX,
          centerY + anchorOffsetY + panPixelY
        ];
        posProp.setValueAtKey(time, posArray);
      }

      // Rotation
      if (rotProp && f.r !== 0) {
        rotProp.setValueAtKey(time, f.r * intensity);
      }
    }

    // 보간 타입 설정 (Bezier 또는 Linear)
    setInterpolation(scaleProp, preset.ease);
    if (posProp) setInterpolation(posProp, preset.ease);
    if (rotProp) setInterpolation(rotProp, preset.ease);

    return 'OK:' + presetId + ':' + finalScale.toFixed(1) + '%';
  } catch (e) {
    return 'Error: ' + e.message + ' (line ' + e.line + ')';
  }
}

/**
 * 여러 클립에 일괄 적용 (JSON 문자열로 배열 전달)
 *
 * @param {string} assignmentsJson - JSON 배열
 *   [{trackIdx, clipIdx, presetId, anchorX, anchorY, intensity}]
 * @returns {string} 결과 JSON 배열
 */
function applyMotionBatch(assignmentsJson) {
  try {
    var assignments = JSON.parse(assignmentsJson);
    var results = [];

    for (var i = 0; i < assignments.length; i++) {
      var a = assignments[i];
      var r = applyMotionToClip(
        a.trackIdx, a.clipIdx, a.presetId,
        a.anchorX || 50, a.anchorY || 50, a.intensity || 1.0
      );
      results.push({ idx: i, clip: a.clipIdx, result: r });
    }

    return JSON.stringify(results);
  } catch (e) {
    return JSON.stringify({ error: e.message });
  }
}

/**
 * 선택된 클립들의 모션 키프레임을 모두 제거 (되돌리기)
 * @returns {string} 결과
 */
function removeMotionFromSelected() {
  try {
    var seq = app.project.activeSequence;
    if (!seq) return 'Error: No active sequence';

    var selection = seq.getSelection();
    if (!selection || selection.length === 0) {
      return 'Error: No clips selected';
    }

    var count = 0;
    for (var i = 0; i < selection.length; i++) {
      var clip = selection[i];
      var motion = null;
      for (var ci = 0; ci < clip.components.numItems; ci++) {
        if (clip.components[ci].displayName === 'Motion' ||
            clip.components[ci].displayName === '모션') {
          motion = clip.components[ci];
          break;
        }
      }
      if (!motion) continue;

      var scaleProp = findProp(motion, ['Scale', '비율']);
      var posProp = findProp(motion, ['Position', '위치']);
      var rotProp = findProp(motion, ['Rotation', '회전']);

      if (scaleProp) { clearKeyframes(scaleProp); scaleProp.setValue(100); }
      if (posProp) {
        clearKeyframes(posProp);
        var seqW = parseInt(seq.frameSizeHorizontal);
        var seqH = parseInt(seq.frameSizeVertical);
        posProp.setValue([seqW / 2, seqH / 2]);
      }
      if (rotProp) { clearKeyframes(rotProp); rotProp.setValue(0); }
      count++;
    }

    return 'Removed motion from ' + count + ' clip(s)';
  } catch (e) {
    return 'Error: ' + e.message;
  }
}

// ═══════════════════════════════════════════════════════════
// 유틸리티 함수
// ═══════════════════════════════════════════════════════════

/**
 * 이름 배열로 프로퍼티 찾기 (다국어 대응)
 */
function findProp(component, names) {
  for (var pi = 0; pi < component.properties.numItems; pi++) {
    var prop = component.properties[pi];
    for (var ni = 0; ni < names.length; ni++) {
      if (prop.displayName === names[ni]) return prop;
    }
  }
  return null;
}

/**
 * 프로퍼티의 키프레임 전부 제거
 */
function clearKeyframes(prop) {
  if (!prop) return;
  try {
    // setTimeVarying(false) 후 다시 true로 → 키프레임 초기화
    if (prop.isTimeVarying()) {
      prop.setTimeVarying(false);
    }
    prop.setTimeVarying(true);
  } catch (e) {
    // 일부 프로퍼티는 setTimeVarying 미지원 — 무시
  }
}

/**
 * 키프레임 보간 타입 설정
 * ⚠️ ExtendScript에서는 기본 Bezier/Linear만 지원 (커스텀 핸들 불가)
 */
function setInterpolation(prop, easeType) {
  // Premiere ExtendScript에서 보간 설정은 제한적
  // 키프레임 추가 시 기본 Bezier가 적용되므로 linear만 별도 처리
  // (추후 API 업데이트로 개선 가능)
}

/**
 * 프리셋 목록 반환 (패널 UI 초기화용)
 */
function getPresetList() {
  var list = [];
  for (var key in PRESET_DEFS) {
    if (PRESET_DEFS.hasOwnProperty(key)) {
      var p = PRESET_DEFS[key];
      list.push({
        id: key,
        frameCount: p.frames.length,
        duration: p.dur,
        ease: p.ease,
        alternate: p.alt,
        overscale: Math.round(calcOverscale(key) * 100)
      });
    }
  }
  return JSON.stringify(list);
}
