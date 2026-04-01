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

    // ─── Motion 컴포넌트 찾기 (다국어 + 인덱스 폴백) ───
    var motion = findMotionComponent(clip);
    if (!motion) return 'Error: Motion component not found (components=' + clip.components.numItems + ')';

    // Scale 프로퍼티 찾기
    var scaleProp = findProp(motion, ['Scale', '비율', 'Échelle', 'Skalierung', 'Scala']);
    if (!scaleProp) return 'Error: Scale property not found';

    // Rotation 프로퍼티 (optional)
    var rotProp = findProp(motion, ['Rotation', '회전', 'Drehung', 'Rotación']);

    // ─── 클립 시간 범위 (타임라인 기준) ───
    var startTime = clip.start.seconds;
    var endTime = clip.end.seconds;
    var dur = endTime - startTime;
    if (dur <= 0) return 'Error: Clip duration is 0';

    // Position 프로퍼티 (기존 키프레임 제거 전용 — 새 키프레임은 추가 안 함)
    var posProp = findProp(motion, ['Position', '위치', 'Posición']);

    // ─── 기존 키프레임 전부 제거 + 키프레임 모드 활성화 ───
    enableKeyframing(scaleProp);
    if (rotProp) enableKeyframing(rotProp);
    // Position: 기존 Motion Master가 적용한 키프레임 제거 (있다면)
    if (posProp) {
      try { if (posProp.isTimeVarying()) posProp.setTimeVarying(false); } catch(ep){}
    }

    // ─── Scale 키프레임만 적용 (Position compound property 깨짐 방지) ───
    // Premiere는 자체적으로 프레임 클리핑하므로 오버스케일 불필요
    // 프리셋의 scale 값을 100 기준 퍼센트로 그대로 적용
    var frames = preset.frames;
    var numFrames = frames.length;
    var appliedCount = 0;

    for (var fi = 0; fi < numFrames; fi++) {
      var f = frames[fi];
      var ratio = numFrames > 1 ? fi / (numFrames - 1) : 0;
      var time = startTime + dur * ratio;

      // Scale: 프리셋 값 × 100 = 퍼센트 (1.15 → 115%)
      // intensity 적용: 편차만 강도 조절 (1.0에서의 차이)
      var scaleDelta = (f.s - 1.0) * intensity;
      var finalScale = (1.0 + scaleDelta) * 100;

      scaleProp.addKey(time);
      scaleProp.setValueAtKey(time, finalScale, true);
      appliedCount++;

      // Rotation (값이 있을 때만)
      if (rotProp && Math.abs(f.r) > 0.01) {
        rotProp.addKey(time);
        rotProp.setValueAtKey(time, f.r * intensity, true);
      }
    }

    return 'OK:' + presetId + ':' + finalScale.toFixed(0) + '%:kf=' + appliedCount;
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

      var scaleProp = findProp(motion, ['Scale', '비율', 'Échelle', 'Skalierung', 'Scala']);
      var rotProp = findProp(motion, ['Rotation', '회전', 'Drehung', 'Rotación']);
      var posProp = findProp(motion, ['Position', '위치', 'Posición']);

      // Scale: 키프레임 제거 + 100%로 리셋
      if (scaleProp) {
        try { if (scaleProp.isTimeVarying()) scaleProp.setTimeVarying(false); } catch(e1){}
        try { scaleProp.setValue(100, true); } catch(e2){}
      }
      // Rotation: 키프레임 제거 + 0으로 리셋
      if (rotProp) {
        try { if (rotProp.isTimeVarying()) rotProp.setTimeVarying(false); } catch(e3){}
        try { rotProp.setValue(0, true); } catch(e4){}
      }
      // Position: 키프레임 제거 + 중앙으로 리셋 (기존 Motion Master가 적용한 경우 대비)
      if (posProp) {
        try { if (posProp.isTimeVarying()) posProp.setTimeVarying(false); } catch(e5){}
      }
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
