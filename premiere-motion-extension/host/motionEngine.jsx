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

// 동일 클립 재적용/되돌리기 시 원래 Motion 값을 복원하기 위한 세션 메모리
var MOTION_BASELINES = {};

// ═══════════════════════════════════════════════════════════
// 오버스케일 계산 — 검은 테두리 방지
// ═══════════════════════════════════════════════════════════

/**
 * 프리셋별 필요한 최소 오버스케일을 계산한다.
 * 모든 키프레임의 pan/rotation 여유를 분석하여
 * 이미지가 프레임 밖으로 벗어나지 않는 최소 배율을 반환한다.
 *
 * @param {string} presetId - 프리셋 ID
 * @returns {number} 오버스케일 배율 (예: 1.21 = 121%)
 */
function calcFrameCoverageScale(frame, anchorX, anchorY, intensity, seqW, seqH) {
  if (typeof seqW !== 'number' || seqW <= 0) seqW = 1920;
  if (typeof seqH !== 'number' || seqH <= 0) seqH = 1080;

  var dx = (((frame.tx * intensity) + (50 - anchorX)) / 100) * seqW;
  var dy = (((frame.ty * intensity) + (50 - anchorY)) / 100) * seqH;
  var rotationRad = Math.abs(frame.r * intensity) * Math.PI / 180;
  var cosT = Math.cos(rotationRad);
  var sinT = Math.sin(rotationRad);
  var halfW = seqW / 2;
  var halfH = seqH / 2;
  var requiredScale = 1.0;
  var corners = [[-1, -1], [1, -1], [1, 1], [-1, 1]];

  for (var i = 0; i < corners.length; i++) {
    var px = (corners[i][0] * halfW) - dx;
    var py = (corners[i][1] * halfH) - dy;
    var qx = (px * cosT) + (py * sinT);
    var qy = (-px * sinT) + (py * cosT);
    var scaleX = Math.abs(qx) / halfW;
    var scaleY = Math.abs(qy) / halfH;

    if (scaleX > requiredScale) requiredScale = scaleX;
    if (scaleY > requiredScale) requiredScale = scaleY;
  }

  return requiredScale * 1.05;
}

function calcOverscale(presetId, seqW, seqH, anchorX, anchorY, intensity) {
  var preset = PRESET_DEFS[presetId];
  if (!preset) return 1.05;
  if (typeof anchorX !== 'number' || isNaN(anchorX)) anchorX = 50;
  if (typeof anchorY !== 'number' || isNaN(anchorY)) anchorY = 50;
  if (typeof intensity !== 'number' || intensity <= 0) intensity = 1.0;

  var maxCoverage = 1.05;

  for (var i = 0; i < preset.frames.length; i++) {
    var f = preset.frames[i];
    var coverage = calcFrameCoverageScale(f, anchorX, anchorY, intensity, seqW, seqH);
    if (coverage > maxCoverage) maxCoverage = coverage;
  }

  return maxCoverage;
}

// ═══════════════════════════════════════════════════════════
// Time 객체 헬퍼 — Premiere API는 Time 객체를 요구한다
// ═══════════════════════════════════════════════════════════

/**
 * 초(seconds)를 Premiere Time 객체로 변환한다.
 * addKey() / setValueAtKey()에 float를 넘기면 무시되므로 반드시 사용.
 * @param {number} seconds - 시간 (초)
 * @returns {Time} Premiere Time 객체
 */
function makeTime(seconds) {
  var t = new Time();
  t.seconds = seconds;
  return t;
}

// ═══════════════════════════════════════════════════════════
// Premiere Pro API — 클립 조회
// ═══════════════════════════════════════════════════════════

/**
 * 현재 시퀀스에서 선택된 클립 목록을 JSON으로 반환한다.
 * @returns {string} JSON 배열 — [{name, trackIdx, clipIdx, start, end, dur, mediaPath}]
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
      // 비디오 트랙 클립만 처리 (오디오 클립 제외)
      if (!clip || !clip.projectItem) continue;
      if (clip.mediaType && clip.mediaType !== 'Video') continue;

      var trackIdx = -1;
      var clipIdx = -1;
      // nodeId 기반 매칭 (이름+시간 매칭보다 안전)
      var clipNodeId = clip.nodeId;
      for (var t = 0; t < seq.videoTracks.numTracks; t++) {
        var track = seq.videoTracks[t];
        for (var c = 0; c < track.clips.numItems; c++) {
          if (clipNodeId && track.clips[c].nodeId === clipNodeId) {
            trackIdx = t;
            clipIdx = c;
            break;
          }
          // nodeId 폴백: 이름+시간 매칭
          if (!clipNodeId &&
              track.clips[c].name === clip.name &&
              Math.abs(track.clips[c].start.seconds - clip.start.seconds) < 0.01) {
            trackIdx = t;
            clipIdx = c;
            break;
          }
        }
        if (trackIdx >= 0) break;
      }
      if (trackIdx < 0 || clipIdx < 0) continue;

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
    if (typeof anchorX !== 'number' || isNaN(anchorX)) anchorX = 50;
    if (typeof anchorY !== 'number' || isNaN(anchorY)) anchorY = 50;
    if (anchorX < 0) anchorX = 0;
    if (anchorX > 100) anchorX = 100;
    if (anchorY < 0) anchorY = 0;
    if (anchorY > 100) anchorY = 100;

    // ─── Motion 컴포넌트 찾기 (다국어 + 인덱스 폴백) ───
    var motion = findMotionComponent(clip);
    if (!motion) return 'Error: Motion component not found (components=' + clip.components.numItems + ')';

    // Scale 프로퍼티 찾기
    var scaleProp = findProp(motion, ['Scale', '비율', 'Échelle', 'Skalierung', 'Scala', 'Escala', 'Schaal'], 4);
    if (!scaleProp) return 'Error: Scale property not found';

    // Position 프로퍼티 (패닝 적용용)
    var posProp = findProp(motion, ['Position', '위치', 'Posición', 'Posizione', 'Positie'], 1);

    // Rotation 프로퍼티 (optional)
    var rotProp = findProp(motion, ['Rotation', '회전', 'Drehung', 'Rotación', 'Rotazione', 'Rotatie'], 5);

    // ─── 클립 시간 범위 (타임라인 기준) ───
    var startSec = clip.start.seconds;
    var endSec = clip.end.seconds;
    var dur = endSec - startSec;
    if (dur <= 0) return 'Error: Clip duration is 0';

    // ─── 시퀀스 프레임 크기 (Position 계산용) ───
    var seqW = seq.frameSizeHorizontal || 1920;
    var seqH = seq.frameSizeVertical || 1080;

    var baselineKey = getClipBaselineKey(clip);
    var baseline = MOTION_BASELINES[baselineKey];
    // baseline이 없으면 현재 값을 baseline으로 저장 (세션 재시작 후에도 동작)
    if (!baseline) {
      baseline = {
        scale: readScalarValue(scaleProp, 100),
        position: readPointValue(posProp, [seqW / 2, seqH / 2]),
        rotation: readScalarValue(rotProp, 0)
      };
      MOTION_BASELINES[baselineKey] = {
        scale: baseline.scale,
        position: [baseline.position[0], baseline.position[1]],
        rotation: baseline.rotation
      };
    }

    var hasPositionMotion = (anchorX !== 50 || anchorY !== 50);
    var hasRotationMotion = false;
    for (var mi = 0; mi < preset.frames.length; mi++) {
      var motionFrame = preset.frames[mi];
      if (!hasPositionMotion && (Math.abs(motionFrame.tx) > 0.001 || Math.abs(motionFrame.ty) > 0.001)) {
        hasPositionMotion = true;
      }
      if (!hasRotationMotion && Math.abs(motionFrame.r) > 0.01) {
        hasRotationMotion = true;
      }
    }

    // ─── 기존 키프레임 전부 제거 + 키프레임 모드 활성화 ───
    enableKeyframing(scaleProp);
    if (hasRotationMotion) enableKeyframing(rotProp);
    else resetPropToStaticValue(rotProp, baseline.rotation);
    if (hasPositionMotion) enableKeyframing(posProp);
    else resetPropToStaticValue(posProp, baseline.position);

    // ─── 키프레임 적용 (Time 객체 사용 필수!) ───
    var frames = preset.frames;
    var numFrames = frames.length;
    var appliedCount = 0;
    var errors = [];
    var maxAppliedScale = 0;

    for (var fi = 0; fi < numFrames; fi++) {
      var f = frames[fi];
      var ratio = numFrames > 1 ? fi / (numFrames - 1) : 0;
      var timeSec = startSec + dur * ratio;
      var keyTime = makeTime(timeSec);

      // Scale: 프리셋 배율과 검은 테두리 방지 배율 중 더 큰 값을 사용
      var scaleDelta = (f.s - 1.0) * intensity;
      var presetScale = 1.0 + scaleDelta;
      var coverageScale = calcFrameCoverageScale(f, anchorX, anchorY, intensity, seqW, seqH);
      var finalScale = baseline.scale * Math.max(presetScale, coverageScale);
      if (finalScale > maxAppliedScale) maxAppliedScale = finalScale;

      var rc1 = scaleProp.addKey(keyTime);
      scaleProp.setValueAtKey(keyTime, finalScale, 1);
      if (rc1 !== 0) errors.push('addKey@' + timeSec.toFixed(2) + '=rc' + rc1);

      // Ease 설정 (linear=0, bezier=5)
      try {
        var interpType = (preset.ease === 'linear') ? 0 : 5;
        scaleProp.setInterpolationTypeAtKey(keyTime, interpType, true);
      } catch(eInterp) {}

      appliedCount++;

      // Position 패닝: 모션이 있는 프리셋은 0값 프레임도 키프레임으로 유지해야 시작/끝 구간이 보존된다.
      if (posProp && hasPositionMotion) {
        try {
          // tx/ty는 퍼센트 기반 → 픽셀로 변환
          var anchorOffX = (50 - anchorX) / 100 * seqW;
          var anchorOffY = (50 - anchorY) / 100 * seqH;
          var panX = baseline.position[0] + (f.tx * intensity / 100 * seqW) + anchorOffX;
          var panY = baseline.position[1] + (f.ty * intensity / 100 * seqH) + anchorOffY;
          posProp.addKey(keyTime);
          posProp.setValueAtKey(keyTime, [panX, panY], 1);
          try {
            var posInterp = (preset.ease === 'linear') ? 0 : 5;
            posProp.setInterpolationTypeAtKey(keyTime, posInterp, true);
          } catch(epi) {}
        } catch (ep) {
          errors.push('pos@' + timeSec.toFixed(2) + ':' + ep.message);
        }
      }

      // Rotation: 시작/끝 0도 프레임도 키프레임으로 남겨야 회전 애니메이션이 정상 보간된다.
      if (rotProp && hasRotationMotion) {
        rotProp.addKey(keyTime);
        rotProp.setValueAtKey(keyTime, baseline.rotation + (f.r * intensity), 1);
        try {
          var rotInterp = (preset.ease === 'linear') ? 0 : 5;
          rotProp.setInterpolationTypeAtKey(keyTime, rotInterp, true);
        } catch(eri) {}
      }
    }

    var result = 'OK:' + presetId + ':' + Math.round(maxAppliedScale) + '%:kf=' + appliedCount;
    if (errors.length > 0) result += ':warn=' + errors.join(';');
    return result;
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
        (typeof a.anchorX === 'number' && !isNaN(a.anchorX)) ? a.anchorX : 50,
        (typeof a.anchorY === 'number' && !isNaN(a.anchorY)) ? a.anchorY : 50,
        (typeof a.intensity === 'number' && a.intensity > 0) ? a.intensity : 1.0
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

    var seqW = seq.frameSizeHorizontal || 1920;
    var seqH = seq.frameSizeVertical || 1080;
    var count = 0;
    for (var i = 0; i < selection.length; i++) {
      var clip = selection[i];
      if (!clip || !clip.projectItem) continue;
      if (clip.mediaType && clip.mediaType !== 'Video') continue;
      var motion = findMotionComponent(clip);
      if (!motion) continue;

      var baselineKey = getClipBaselineKey(clip);
      var baseline = MOTION_BASELINES[baselineKey];
      // baseline 없으면 기본값 사용 (세션 재시작 후에도 Undo 가능)
      if (!baseline) baseline = { scale: 100, position: [seqW / 2, seqH / 2], rotation: 0 };

      var scaleProp = findProp(motion, ['Scale', '비율', 'Échelle', 'Skalierung', 'Scala', 'Escala', 'Schaal'], 4);
      var rotProp = findProp(motion, ['Rotation', '회전', 'Drehung', 'Rotación', 'Rotazione', 'Rotatie'], 5);
      var posProp = findProp(motion, ['Position', '위치', 'Posición', 'Posizione', 'Positie'], 1);

      // Scale: 키프레임 제거 + baseline 값으로 복원
      if (scaleProp) {
        try { if (scaleProp.isTimeVarying()) scaleProp.setTimeVarying(false); } catch(e1){}
        try { scaleProp.setValue(baseline.scale, true); } catch(e2){}
      }
      // Rotation: 키프레임 제거 + baseline 값으로 복원
      if (rotProp) {
        try { if (rotProp.isTimeVarying()) rotProp.setTimeVarying(false); } catch(e3){}
        try { rotProp.setValue(baseline.rotation, true); } catch(e4){}
      }
      // Position: 키프레임 제거 + baseline 값으로 복원
      if (posProp) {
        try { if (posProp.isTimeVarying()) posProp.setTimeVarying(false); } catch(e5){}
        try { posProp.setValue([baseline.position[0], baseline.position[1]], true); } catch(e6){}
      }
      delete MOTION_BASELINES[baselineKey];
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
 * Motion 컴포넌트 찾기 (다국어 이름 + 인덱스 폴백)
 */
function findMotionComponent(clip) {
  var motionNames = ['Motion', '모션', 'Mouvement', 'Bewegung', 'Movimiento', 'Movimento'];
  for (var ci = 0; ci < clip.components.numItems; ci++) {
    var compName = clip.components[ci].displayName;
    for (var ni = 0; ni < motionNames.length; ni++) {
      if (compName === motionNames[ni]) return clip.components[ci];
    }
  }
  // 폴백: index 1 (보통 Motion)
  if (clip.components.numItems > 1) return clip.components[1];
  return null;
}

/**
 * 이름 배열로 프로퍼티 찾기 (다국어 대응 + 인덱스 폴백)
 * Motion.properties 인덱스: [0]=AnchorPoint, [1]=Position, [2]=ScaleH, [3]=ScaleW, [4]=Scale, [5]=Rotation, [6]=Opacity
 */
function findProp(component, names, fallbackIdx) {
  for (var pi = 0; pi < component.properties.numItems; pi++) {
    var prop = component.properties[pi];
    for (var ni = 0; ni < names.length; ni++) {
      if (prop.displayName === names[ni]) return prop;
    }
  }
  // 로케일 이름 매칭 실패 시 인덱스 폴백
  if (typeof fallbackIdx === 'number' && fallbackIdx >= 0 &&
      fallbackIdx < component.properties.numItems) {
    return component.properties[fallbackIdx];
  }
  return null;
}

function getClipBaselineKey(clip) {
  if (!clip) return 'clip:unknown';
  if (clip.nodeId) return 'node:' + clip.nodeId;
  var name = clip.name || 'unnamed';
  var startTicks = '';
  var endTicks = '';
  try { startTicks = clip.start.ticks || ''; } catch (e1) {}
  try { endTicks = clip.end.ticks || ''; } catch (e2) {}
  return 'clip:' + name + ':' + startTicks + ':' + endTicks;
}

function readScalarValue(prop, fallback) {
  if (!prop) return fallback;
  try {
    var value = prop.getValue();
    if (typeof value === 'number' && !isNaN(value)) return value;
  } catch (e) {}
  return fallback;
}

function readPointValue(prop, fallback) {
  if (!prop) return [fallback[0], fallback[1]];
  try {
    var value = prop.getValue();
    if (value && value.length >= 2 &&
        typeof value[0] === 'number' && !isNaN(value[0]) &&
        typeof value[1] === 'number' && !isNaN(value[1])) {
      return [value[0], value[1]];
    }
  } catch (e) {}
  return [fallback[0], fallback[1]];
}

function propIsTimeVarying(prop) {
  if (!prop) return false;
  try {
    return prop.isTimeVarying();
  } catch (e) {}
  return false;
}

function hasExistingMotionKeyframes(scaleProp, posProp, rotProp) {
  return propIsTimeVarying(scaleProp) ||
         propIsTimeVarying(posProp) ||
         propIsTimeVarying(rotProp);
}

function resetPropToStaticValue(prop, value) {
  if (!prop) return;
  try {
    if (prop.isTimeVarying()) prop.setTimeVarying(false);
  } catch (e1) {}
  try {
    if (value && value.length >= 2) prop.setValue([value[0], value[1]], true);
    else prop.setValue(value, true);
  } catch (e2) {}
}

/**
 * 키프레임 모드 활성화 + 기존 키프레임 제거
 * setTimeVarying(false) → setTimeVarying(true) 로 초기화
 */
function enableKeyframing(prop) {
  if (!prop) return;
  try {
    // 1) 기존 키프레임 제거
    if (prop.isTimeVarying()) {
      prop.setTimeVarying(false);
    }
    // 2) 키프레임 모드 다시 활성화
    if (prop.areKeyframesSupported()) {
      prop.setTimeVarying(true);
    }
  } catch (e) {
    // 일부 프로퍼티는 areKeyframesSupported 미지원
    try { prop.setTimeVarying(true); } catch (e2) {}
  }
}

// ═══════════════════════════════════════════════════════════
// 디버깅 — Console에서 원인 파악용
// ═══════════════════════════════════════════════════════════

/**
 * 선택된 첫 번째 클립에 단계별 진단을 실행하고
 * 각 단계의 성공/실패를 상세히 반환한다.
 * Chrome DevTools Console에서: evalScript('debugMotion()')
 */
function debugMotion() {
  var log = [];
  try {
    var seq = app.project.activeSequence;
    if (!seq) return JSON.stringify({ error: 'No active sequence' });
    log.push('SEQ: ' + seq.name);

    var selection = seq.getSelection();
    if (!selection || selection.length === 0) {
      return JSON.stringify({ error: 'No clips selected', log: log });
    }
    log.push('SELECTION: ' + selection.length + ' clips');

    var clip = selection[0];
    log.push('CLIP: ' + clip.name);
    log.push('START seconds: ' + clip.start.seconds);
    log.push('START ticks: ' + clip.start.ticks);
    log.push('END seconds: ' + clip.end.seconds);
    log.push('DUR: ' + (clip.end.seconds - clip.start.seconds) + 's');

    // 컴포넌트 목록
    log.push('COMPONENTS (' + clip.components.numItems + '):');
    for (var ci = 0; ci < clip.components.numItems; ci++) {
      log.push('  [' + ci + '] ' + clip.components[ci].displayName);
    }

    var motion = findMotionComponent(clip);
    if (!motion) {
      return JSON.stringify({ error: 'Motion component not found', log: log });
    }
    log.push('MOTION: ' + motion.displayName);

    // 프로퍼티 목록
    log.push('PROPERTIES (' + motion.properties.numItems + '):');
    for (var pi = 0; pi < motion.properties.numItems; pi++) {
      var p = motion.properties[pi];
      var info = '[' + pi + '] ' + p.displayName;
      try { info += ' keySupported=' + p.areKeyframesSupported(); } catch(e1) { info += ' keySupported=ERROR'; }
      try { info += ' timeVarying=' + p.isTimeVarying(); } catch(e2) { info += ' timeVarying=ERROR'; }
      try { info += ' value=' + JSON.stringify(p.getValue()); } catch(e3) { info += ' value=ERROR'; }
      log.push('  ' + info);
    }

    // Scale 프로퍼티 테스트
    var scaleProp = findProp(motion, ['Scale', '비율', 'Échelle', 'Skalierung', 'Scala', 'Escala', 'Schaal'], 4);
    if (!scaleProp) {
      return JSON.stringify({ error: 'Scale prop not found', log: log });
    }

    log.push('--- SCALE DIAGNOSTICS ---');
    log.push('Scale displayName: ' + scaleProp.displayName);

    // 현재 값
    try {
      var curVal = scaleProp.getValue();
      log.push('Current value: ' + JSON.stringify(curVal));
    } catch(ev) {
      log.push('getValue ERROR: ' + ev.message);
    }

    // keyframesSupported 확인
    try {
      log.push('areKeyframesSupported: ' + scaleProp.areKeyframesSupported());
    } catch(ek) {
      log.push('areKeyframesSupported ERROR: ' + ek.message);
    }

    // 기존 키프레임 제거 + 활성화
    enableKeyframing(scaleProp);
    try {
      log.push('isTimeVarying after enable: ' + scaleProp.isTimeVarying());
    } catch(et) {
      log.push('isTimeVarying ERROR: ' + et.message);
    }

    // 테스트 시간
    var testTimeSeconds = clip.start.seconds + 0.1;
    var testTimeTicks = clip.start.ticks;
    var testTimeObj = clip.start;

    // === 시도 1: addKey(float seconds) ===
    log.push('--- TEST 1: addKey(float seconds=' + testTimeSeconds + ') ---');
    try {
      var result1 = scaleProp.addKey(testTimeSeconds);
      log.push('addKey result: ' + JSON.stringify(result1));
    } catch(e1) {
      log.push('addKey ERROR: ' + e1.message + ' (line ' + e1.line + ')');
    }

    // setValueAtKey 시도
    try {
      scaleProp.setValueAtKey(testTimeSeconds, 120, 1);
      log.push('setValueAtKey(float, 120, 1): OK');
    } catch(es1) {
      log.push('setValueAtKey ERROR: ' + es1.message);
    }

    // 키프레임 수 확인
    try {
      log.push('isTimeVarying after addKey: ' + scaleProp.isTimeVarying());
    } catch(et2) {}

    // 키프레임 제거하고 시도 2
    enableKeyframing(scaleProp);

    // === 시도 2: addKey(ticks string) ===
    log.push('--- TEST 2: addKey(ticks="' + testTimeTicks + '") ---');
    try {
      var result2 = scaleProp.addKey(testTimeTicks);
      log.push('addKey result: ' + JSON.stringify(result2));
    } catch(e2) {
      log.push('addKey ERROR: ' + e2.message + ' (line ' + e2.line + ')');
    }

    try {
      scaleProp.setValueAtKey(testTimeTicks, 120, 1);
      log.push('setValueAtKey(ticks, 120, 1): OK');
    } catch(es2) {
      log.push('setValueAtKey ERROR: ' + es2.message);
    }

    try {
      log.push('isTimeVarying after addKey: ' + scaleProp.isTimeVarying());
    } catch(et3) {}

    // 키프레임 제거하고 시도 3
    enableKeyframing(scaleProp);

    // === 시도 3: addKey(Time object) ===
    log.push('--- TEST 3: addKey(Time object) ---');
    try {
      var result3 = scaleProp.addKey(clip.start);
      log.push('addKey result: ' + JSON.stringify(result3));
    } catch(e3) {
      log.push('addKey ERROR: ' + e3.message + ' (line ' + e3.line + ')');
    }

    try {
      scaleProp.setValueAtKey(clip.start, 120, 1);
      log.push('setValueAtKey(Time, 120, 1): OK');
    } catch(es3) {
      log.push('setValueAtKey ERROR: ' + es3.message);
    }

    try {
      log.push('isTimeVarying after addKey: ' + scaleProp.isTimeVarying());
    } catch(et4) {}

    // 정리: 키프레임 제거
    try { scaleProp.setTimeVarying(false); } catch(ec) {}
    try { scaleProp.setValue(100, 1); } catch(ec2) {}

    // === 시도 4: setValue 직접 변경 (키프레임 없이) ===
    log.push('--- TEST 4: setValue(130) 직접 ───');
    try {
      scaleProp.setValue(130, 1);
      log.push('setValue(130): OK');
      var afterVal = scaleProp.getValue();
      log.push('getValue after: ' + JSON.stringify(afterVal));
      // 원래대로
      scaleProp.setValue(100, 1);
    } catch(e4) {
      log.push('setValue ERROR: ' + e4.message);
    }

    // === 시도 5: getKeyframeCount 등 API 존재 확인 ===
    log.push('--- API CHECK ---');
    var apiMethods = ['addKey', 'setValueAtKey', 'getValueAtKey', 'removeKey',
                      'removeKeyRange', 'findNearestKey', 'findPreviousKey',
                      'findNextKey', 'getKeys'];
    for (var mi = 0; mi < apiMethods.length; mi++) {
      log.push(apiMethods[mi] + ': ' + (typeof scaleProp[apiMethods[mi]]));
    }

    return JSON.stringify({ ok: true, log: log });
  } catch (e) {
    log.push('FATAL: ' + e.message + ' (line ' + e.line + ')');
    return JSON.stringify({ error: e.message, log: log });
  }
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
