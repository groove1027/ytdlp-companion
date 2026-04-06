/**
 * Motion Master — CEP Panel Application
 * Premiere Pro Extension 메인 패널 로직
 *
 * CSInterface로 ExtendScript(motionEngine.jsx)와 통신하여
 * 선택된 클립에 Ken Burns 모션을 적용한다.
 */

import { PANZOOM_PRESETS, MOTION_EFFECTS, calcOverscale } from './presets.js';
import { smartRandomAssign } from './smartRandom.js';
import { detectFocalFromPath, detectFocalBatch } from './focalDetector.js';

// ═══ CSInterface 초기화 ═══

let csInterface;
try {
  csInterface = new CSInterface();
} catch (e) {
  // 브라우저 테스트 모드 (Premiere 외부)
  csInterface = null;
  console.warn('[MotionMaster] CSInterface not available — running in browser test mode');
}

// ═══ 상태 ═══

const state = {
  selectedClips: [],
  currentPreset: 'cinematic',
  currentMotion: 'none',
  anchorX: 50,
  anchorY: 50,
  intensity: 1.0,
  assignments: [],       // 스마트 랜덤 결과
  allowMotionEffects: false,
  busy: false,           // 적용 중 레이스 컨디션 방지
};

// ═══ ExtendScript 호출 헬퍼 ═══

const EVALSCRIPT_TIMEOUT_MS = 15000;

function getActivePresetId() {
  return state.currentMotion !== 'none' ? state.currentMotion : state.currentPreset;
}

function getClipListSignature(clips) {
  return clips
    .map((clip) => [clip.trackIdx, clip.clipIdx, clip.start, clip.end].join(':'))
    .join('|');
}

function clearAssignments() {
  if (state.assignments.length === 0) return;
  state.assignments = [];
  renderAssignmentList();
}

function evalScript(script) {
  return new Promise((resolve, reject) => {
    if (!csInterface) {
      console.log('[Mock ExtendScript]', script.substring(0, 100));
      resolve('{}');
      return;
    }

    let settled = false;
    const timer = window.setTimeout(() => {
      if (settled) return;
      settled = true;
      reject(new Error('ExtendScript timeout after ' + EVALSCRIPT_TIMEOUT_MS + 'ms'));
    }, EVALSCRIPT_TIMEOUT_MS);

    const finish = (callback) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timer);
      callback();
    };

    try {
      csInterface.evalScript(script, (result) => {
        finish(() => {
          if (result === 'EvalScript error.') {
            reject(new Error('ExtendScript evaluation error'));
          } else {
            resolve(result);
          }
        });
      });
    } catch (e) {
      finish(() => reject(e));
    }
  });
}

// ═══ 클립 조회 (자동 감지 포함) ═══

let _refreshPromise = null;
let _refreshWantsStatus = false;

async function refreshSelectedClips(silent, force) {
  if (silent !== true) _refreshWantsStatus = true;
  // force=true: 진행 중인 polling Promise를 무시하고 항상 새 조회 시작
  // (Apply/Random/Smart 버튼 클릭 시 stale 데이터 사용 방지)
  if (_refreshPromise && !force) return _refreshPromise;
  // force 시 이전 Promise가 있으면 완료될 때까지 기다린 후 새로 시작
  if (force && _refreshPromise) {
    try { await _refreshPromise; } catch (e) {}
  }

  _refreshPromise = (async () => {
    try {
      const result = await evalScript('getSelectedClips()');
      const data = JSON.parse(result);
      const shouldShowStatus = _refreshWantsStatus;
      const clips = Array.isArray(data) ? data : [];
      const prevSignature = getClipListSignature(state.selectedClips);
      const nextSignature = getClipListSignature(clips);
      const changed = nextSignature !== prevSignature;

      if (data.error) {
        if (shouldShowStatus) updateStatus(data.error, 'error');
        state.selectedClips = [];
        clearAssignments();
      } else {
        state.selectedClips = clips;
        if (changed) clearAssignments();
        if (shouldShowStatus || changed) {
          updateStatus(clips.length + ' clips selected', 'success');
        }
      }
      renderClipList();
    } catch (e) {
      state.selectedClips = [];
      clearAssignments();
      renderClipList();
      if (_refreshWantsStatus) updateStatus('Clip error: ' + e.message, 'error');
    } finally {
      _refreshPromise = null;
      _refreshWantsStatus = false;
    }
  })();

  return _refreshPromise;
}

// 2초마다 자동 감지 (Premiere에서 선택 변경 시 자동 반영)
let _pollTimer = null;
function startClipPolling() {
  if (_pollTimer) return;
  _pollTimer = setInterval(() => {
    if (!state.busy) refreshSelectedClips(true);
  }, 2000);
}
function stopClipPolling() {
  if (_pollTimer) { clearInterval(_pollTimer); _pollTimer = null; }
}

// ═══ 모션 적용 ═══

async function applyToSelected() {
  if (state.busy) return;
  state.busy = true;
  stopClipPolling();
  try {
    await refreshSelectedClips(true, true);
    if (state.selectedClips.length === 0) {
      updateStatus('Select clips first', 'warn');
      return;
    }

    const clipsSnapshot = state.selectedClips.slice();
    const presetId = getActivePresetId();
    const assignments = clipsSnapshot.map((clip) => ({
      trackIdx: clip.trackIdx,
      clipIdx: clip.clipIdx,
      presetId,
      anchorX: state.anchorX,
      anchorY: state.anchorY,
      intensity: state.intensity,
    }));

    clearAssignments();
    await applyBatch(assignments);
  } finally {
    state.busy = false;
    startClipPolling();
  }
}

async function applyRandomToSelected() {
  if (state.busy) return;
  state.busy = true;
  stopClipPolling();
  try {
    await refreshSelectedClips(true, true);
    if (state.selectedClips.length === 0) {
      updateStatus('Select clips first', 'warn');
      return;
    }

    updateStatus('Applying random motion...', 'info');
    const clipsSnapshot = state.selectedClips.slice();

    const randomAssignments = smartRandomAssign(clipsSnapshot.length, {
      allowMotionEffects: state.allowMotionEffects,
      intensityVariance: 0.1,
    });

    state.assignments = randomAssignments;

    const batch = clipsSnapshot.map((clip, i) => ({
      trackIdx: clip.trackIdx,
      clipIdx: clip.clipIdx,
      presetId: randomAssignments[i].presetId,
      anchorX: randomAssignments[i].anchorX,
      anchorY: randomAssignments[i].anchorY,
      intensity: randomAssignments[i].intensity,
    }));

    await applyBatch(batch);
    renderAssignmentList();
  } finally {
    state.busy = false;
    startClipPolling();
  }
}

async function applySmartToSelected() {
  if (state.busy) return;
  state.busy = true;
  stopClipPolling();
  try {
    await refreshSelectedClips(true, true);
    if (state.selectedClips.length === 0) {
      updateStatus('Select clips first', 'warn');
      return;
    }

    updateStatus('Analyzing focal points...', 'info');
    const clipsSnapshot = state.selectedClips.slice();

    // 1) 스마트 랜덤 배정
    const randomAssignments = smartRandomAssign(clipsSnapshot.length, {
      allowMotionEffects: state.allowMotionEffects,
      intensityVariance: 0.1,
    });

    // 2) 피사체 감지로 앵커 오버라이드
    const mediaPaths = clipsSnapshot.map(c => c.mediaPath);
    const focalPoints = await detectFocalBatch(mediaPaths);

    const finalAssignments = randomAssignments.map((a, i) => {
      const focal = focalPoints[i];
      if (focal && focal.confidence > 0.3) {
        return { ...a, anchorX: focal.x, anchorY: focal.y };
      }
      return a;
    });

    state.assignments = finalAssignments;

    const batch = clipsSnapshot.map((clip, i) => ({
      trackIdx: clip.trackIdx,
      clipIdx: clip.clipIdx,
      presetId: finalAssignments[i].presetId,
      anchorX: finalAssignments[i].anchorX,
      anchorY: finalAssignments[i].anchorY,
      intensity: finalAssignments[i].intensity,
    }));

    await applyBatch(batch);
    renderAssignmentList();
  } finally {
    state.busy = false;
    startClipPolling();
  }
}

async function applyBatch(assignments) {
  try {
    const json = JSON.stringify(assignments)
      .replace(/\\/g, '\\\\')
      .replace(/'/g, "\\'")
      .replace(/\r/g, '\\r')
      .replace(/\n/g, '\\n')
      .replace(/\u2028/g, '\\u2028')
      .replace(/\u2029/g, '\\u2029');
    const result = await evalScript("applyMotionBatch('" + json + "')");
    const data = JSON.parse(result);

    if (data.error) {
      updateStatus('적용 실패: ' + data.error, 'error');
    } else {
      const okCount = data.filter(r => r.result.indexOf('OK') === 0).length;
      const skipCount = data.filter(r => r.result.indexOf('Skip:') === 0).length;
      const errCount = data.length - okCount - skipCount;
      if (errCount > 0) {
        updateStatus(okCount + '개 성공, ' + errCount + '개 실패, ' + skipCount + '개 스킵', 'warn');
      } else if (skipCount > 0) {
        updateStatus(okCount + '개 적용, ' + skipCount + '개 스킵 (기존 모션 키프레임 보호)', 'warn');
      } else {
        updateStatus(okCount + '개 클립에 모션 적용 완료!', 'success');
      }
    }
  } catch (e) {
    updateStatus('배치 적용 실패: ' + e.message, 'error');
  }
}

async function removeMotion() {
  if (state.busy) return;
  state.busy = true;
  stopClipPolling();
  try {
    const result = await evalScript('removeMotionFromSelected()');
    const type = result.indexOf('Error') === 0
      ? 'error'
      : (result.indexOf('Warn:') === 0 ? 'warn' : 'success');
    const message = result.indexOf('Warn:') === 0 ? result.substring(6) : result;
    if (type !== 'error') clearAssignments();
    updateStatus(message, type);
  } catch (e) {
    updateStatus('되돌리기 실패: ' + e.message, 'error');
  } finally {
    state.busy = false;
    startClipPolling();
  }
}

// ═══ UI 렌더링 ═══

function renderPresetGrid() {
  const basicGrid = document.getElementById('basic-presets');
  const cineGrid = document.getElementById('cinematic-presets');
  const motionGrid = document.getElementById('motion-effects');
  const overscaleFor = (presetId) => Math.round(
    calcOverscale(presetId, 1920, 1080, state.anchorX, state.anchorY, state.intensity) * 100
  );

  if (basicGrid) {
    basicGrid.innerHTML = PANZOOM_PRESETS
      .filter(p => p.cat === 'basic')
      .map(p => `<button class="preset-btn ${(state.currentMotion === 'none' && state.currentPreset === p.id) ? 'active' : ''}"
        data-preset="${p.id}" onclick="selectPreset('${p.id}')">
        <span class="p-label">${p.label}</span>
        <span class="p-meta">${overscaleFor(p.id)}%</span>
      </button>`).join('');
  }

  if (cineGrid) {
    cineGrid.innerHTML = PANZOOM_PRESETS
      .filter(p => p.cat === 'cinematic')
      .map(p => `<button class="preset-btn ${(state.currentMotion === 'none' && state.currentPreset === p.id) ? 'active' : ''}"
        data-preset="${p.id}" onclick="selectPreset('${p.id}')">
        <span class="p-label">${p.label}</span>
        <span class="p-meta">${overscaleFor(p.id)}%</span>
      </button>`).join('');
  }

  if (motionGrid) {
    motionGrid.innerHTML = MOTION_EFFECTS
      .map(m => `<button class="tag-btn ${state.currentMotion === m.id ? 'active' : ''}"
        data-motion="${m.id}" onclick="selectMotion('${m.id}')">
        ${m.label}
      </button>`).join('');
  }
}

function renderClipList() {
  const el = document.getElementById('clip-list');
  const badge = document.getElementById('clip-count');
  if (!el) return;

  if (badge) badge.textContent = state.selectedClips.length;

  if (state.selectedClips.length === 0) {
    el.innerHTML = '<div class="clip-empty">Select clips in timeline</div>';
    return;
  }

  // XSS 방지: textContent로 안전하게 렌더링
  el.innerHTML = '';
  state.selectedClips.forEach((c, i) => {
    const row = document.createElement('div');
    row.className = 'clip-row';
    const num = document.createElement('span');
    num.className = 'clip-num';
    num.textContent = i + 1;
    const name = document.createElement('span');
    name.className = 'clip-name';
    name.textContent = c.name;
    name.title = c.mediaPath || '';
    const dur = document.createElement('span');
    dur.className = 'clip-dur';
    dur.textContent = c.dur.toFixed(1) + 's';
    row.appendChild(num);
    row.appendChild(name);
    row.appendChild(dur);
    el.appendChild(row);
  });
}

function renderAssignmentList() {
  const el = document.getElementById('assignment-list');
  if (!el) return;

  if (state.assignments.length === 0) {
    el.innerHTML = ''; return;
  }

  // XSS 방지: textContent로 안전하게 렌더링
  el.innerHTML = '';
  state.assignments.forEach((a, i) => {
    const clip = state.selectedClips[i];
    const clipName = clip ? clip.name : 'Clip ' + (i + 1);
    const item = document.createElement('div');
    item.className = 'assign-item';
    const num = document.createElement('span');
    num.className = 'clip-num';
    num.textContent = i + 1;
    const nameEl = document.createElement('span');
    nameEl.className = 'clip-name';
    nameEl.textContent = clipName;
    const tag = document.createElement('span');
    tag.className = 'assign-tag';
    tag.textContent = a.presetId;
    item.appendChild(num);
    item.appendChild(nameEl);
    item.appendChild(tag);
    el.appendChild(item);
  });
}

function updateStatus(message, type) {
  const el = document.getElementById('status');
  if (!el) return;
  el.textContent = message;
  el.className = type || '';
}

// ═══ 이벤트 핸들러 (window에 노출) ═══

window.selectPreset = function(id) {
  state.currentPreset = id;
  state.currentMotion = 'none';
  renderPresetGrid();
  updateAnchorDisplay();
};

window.selectMotion = function(id) {
  state.currentMotion = id;
  renderPresetGrid();
};

window.onAnchorChange = function(axis, value) {
  if (axis === 'x') state.anchorX = parseInt(value);
  if (axis === 'y') state.anchorY = parseInt(value);
  renderPresetGrid();
  updateAnchorDisplay();
};

window.onIntensityChange = function(value) {
  state.intensity = parseFloat(value);
  document.getElementById('intensity-value').textContent = Math.round(value * 100) + '%';
  renderPresetGrid();
};

window.toggleMotionEffects = function(checked) {
  state.allowMotionEffects = checked;
};

function updateAnchorDisplay() {
  const dot = document.getElementById('anchor-dot');
  const xLabel = document.getElementById('anchor-x-value');
  const yLabel = document.getElementById('anchor-y-value');
  const xSlider = document.getElementById('anchor-x');
  const ySlider = document.getElementById('anchor-y');

  if (dot) {
    dot.style.left = state.anchorX + '%';
    dot.style.top = state.anchorY + '%';
  }
  if (xLabel) xLabel.textContent = state.anchorX + '%';
  if (yLabel) yLabel.textContent = state.anchorY + '%';
  if (xSlider) xSlider.value = state.anchorX;
  if (ySlider) ySlider.value = state.anchorY;
}

// ═══ 초기화 ═══

window.addEventListener('DOMContentLoaded', () => {
  renderPresetGrid();
  updateAnchorDisplay();

  // 버튼 바인딩
  document.getElementById('btn-refresh')?.addEventListener('click', refreshSelectedClips);
  document.getElementById('btn-apply')?.addEventListener('click', applyToSelected);
  document.getElementById('btn-random')?.addEventListener('click', applyRandomToSelected);
  document.getElementById('btn-smart')?.addEventListener('click', applySmartToSelected);
  document.getElementById('btn-remove')?.addEventListener('click', removeMotion);

  if (csInterface) {
    updateStatus('Connected', 'success');
    refreshSelectedClips();
    startClipPolling();
  } else {
    updateStatus('Test mode (no Premiere)', 'warn');
  }
});

// 글로벌 노출 (onclick에서 접근)
window.refreshSelectedClips = refreshSelectedClips;
window.applyToSelected = applyToSelected;
window.applyRandomToSelected = applyRandomToSelected;
window.applySmartToSelected = applySmartToSelected;
window.removeMotion = removeMotion;

// ═══ 디버그 헬퍼 (Console에서 호출) ═══
window.debugMotion = async function() {
  console.log('[MotionMaster] 🔍 Running diagnostics...');
  try {
    const result = await evalScript('debugMotion()');
    const data = JSON.parse(result);
    if (data.log) {
      console.log('[MotionMaster] ═══ DIAGNOSTICS ═══');
      data.log.forEach(line => console.log('  ' + line));
      console.log('[MotionMaster] ═══════════════════');
    }
    if (data.error) {
      console.error('[MotionMaster] ❌', data.error);
    }
    return data;
  } catch (e) {
    console.error('[MotionMaster] Debug failed:', e);
  }
};
