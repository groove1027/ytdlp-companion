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
};

// ═══ ExtendScript 호출 헬퍼 ═══

function evalScript(script) {
  return new Promise((resolve, reject) => {
    if (!csInterface) {
      console.log('[Mock ExtendScript]', script.substring(0, 100));
      resolve('{}');
      return;
    }
    csInterface.evalScript(script, (result) => {
      if (result === 'EvalScript error.') {
        reject(new Error('ExtendScript evaluation error'));
      } else {
        resolve(result);
      }
    });
  });
}

// ═══ 클립 조회 (자동 감지 포함) ═══

async function refreshSelectedClips(silent) {
  try {
    const result = await evalScript('getSelectedClips()');
    const data = JSON.parse(result);

    if (data.error) {
      if (!silent) updateStatus(data.error, 'error');
      state.selectedClips = [];
    } else {
      const changed = data.length !== state.selectedClips.length;
      state.selectedClips = data;
      if (!silent || changed) {
        updateStatus(data.length + ' clips selected', 'success');
      }
    }
    renderClipList();
  } catch (e) {
    state.selectedClips = [];
    renderClipList();
    if (!silent) updateStatus('Clip error: ' + e.message, 'error');
  }
}

// 2초마다 자동 감지 (Premiere에서 선택 변경 시 자동 반영)
let _pollTimer = null;
function startClipPolling() {
  if (_pollTimer) return;
  _pollTimer = setInterval(() => refreshSelectedClips(true), 2000);
}

// ═══ 모션 적용 ═══

async function applyToSelected() {
  // 적용 전 자동 새로고침
  await refreshSelectedClips(true);
  if (state.selectedClips.length === 0) {
    updateStatus('Select clips first', 'warn');
    return;
  }

  const assignments = state.selectedClips.map((clip) => ({
    trackIdx: clip.trackIdx,
    clipIdx: clip.clipIdx,
    presetId: state.currentPreset,
    anchorX: state.anchorX,
    anchorY: state.anchorY,
    intensity: state.intensity,
  }));

  await applyBatch(assignments);
}

async function applyRandomToSelected() {
  await refreshSelectedClips(true);
  if (state.selectedClips.length === 0) {
    updateStatus('Select clips first', 'warn');
    return;
  }

  updateStatus('Applying random motion...', 'info');

  const randomAssignments = smartRandomAssign(state.selectedClips.length, {
    allowMotionEffects: state.allowMotionEffects,
    intensityVariance: 0.1,
  });

  state.assignments = randomAssignments;

  const batch = state.selectedClips.map((clip, i) => ({
    trackIdx: clip.trackIdx,
    clipIdx: clip.clipIdx,
    presetId: randomAssignments[i].presetId,
    anchorX: randomAssignments[i].anchorX,
    anchorY: randomAssignments[i].anchorY,
    intensity: randomAssignments[i].intensity,
  }));

  await applyBatch(batch);
  renderAssignmentList();
}

async function applySmartToSelected() {
  await refreshSelectedClips(true);
  if (state.selectedClips.length === 0) {
    updateStatus('Select clips first', 'warn');
    return;
  }

  updateStatus('Analyzing focal points...', 'info');

  // 1) 스마트 랜덤 배정
  const randomAssignments = smartRandomAssign(state.selectedClips.length, {
    allowMotionEffects: state.allowMotionEffects,
    intensityVariance: 0.1,
  });

  // 2) 피사체 감지로 앵커 오버라이드
  const mediaPaths = state.selectedClips.map(c => c.mediaPath);
  const focalPoints = await detectFocalBatch(mediaPaths);

  const finalAssignments = randomAssignments.map((a, i) => {
    const focal = focalPoints[i];
    if (focal && focal.confidence > 0.3) {
      return { ...a, anchorX: focal.x, anchorY: focal.y };
    }
    return a;
  });

  state.assignments = finalAssignments;

  const batch = state.selectedClips.map((clip, i) => ({
    trackIdx: clip.trackIdx,
    clipIdx: clip.clipIdx,
    presetId: finalAssignments[i].presetId,
    anchorX: finalAssignments[i].anchorX,
    anchorY: finalAssignments[i].anchorY,
    intensity: finalAssignments[i].intensity,
  }));

  await applyBatch(batch);
  renderAssignmentList();
}

async function applyBatch(assignments) {
  try {
    const json = JSON.stringify(assignments).replace(/'/g, "\\'");
    const result = await evalScript("applyMotionBatch('" + json + "')");
    const data = JSON.parse(result);

    if (data.error) {
      updateStatus('적용 실패: ' + data.error, 'error');
    } else {
      const okCount = data.filter(r => r.result.indexOf('OK') === 0).length;
      const errCount = data.length - okCount;
      if (errCount > 0) {
        updateStatus(okCount + '개 성공, ' + errCount + '개 실패', 'warn');
      } else {
        updateStatus(okCount + '개 클립에 모션 적용 완료!', 'success');
      }
    }
  } catch (e) {
    updateStatus('배치 적용 실패: ' + e.message, 'error');
  }
}

async function removeMotion() {
  try {
    const result = await evalScript('removeMotionFromSelected()');
    updateStatus(result, result.indexOf('Error') === 0 ? 'error' : 'success');
  } catch (e) {
    updateStatus('되돌리기 실패: ' + e.message, 'error');
  }
}

// ═══ UI 렌더링 ═══

function renderPresetGrid() {
  const basicGrid = document.getElementById('basic-presets');
  const cineGrid = document.getElementById('cinematic-presets');
  const motionGrid = document.getElementById('motion-effects');

  if (basicGrid) {
    basicGrid.innerHTML = PANZOOM_PRESETS
      .filter(p => p.cat === 'basic')
      .map(p => `<button class="preset-btn ${state.currentPreset === p.id ? 'active' : ''}"
        data-preset="${p.id}" onclick="selectPreset('${p.id}')">
        <span class="p-label">${p.label}</span>
        <span class="p-meta">${Math.round(calcOverscale(p.id) * 100)}%</span>
      </button>`).join('');
  }

  if (cineGrid) {
    cineGrid.innerHTML = PANZOOM_PRESETS
      .filter(p => p.cat === 'cinematic')
      .map(p => `<button class="preset-btn ${state.currentPreset === p.id ? 'active' : ''}"
        data-preset="${p.id}" onclick="selectPreset('${p.id}')">
        <span class="p-label">${p.label}</span>
        <span class="p-meta">${Math.round(calcOverscale(p.id) * 100)}%</span>
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

  el.innerHTML = state.selectedClips.map((c, i) =>
    `<div class="clip-row">
      <span class="clip-num">${i + 1}</span>
      <span class="clip-name" title="${c.mediaPath}">${c.name}</span>
      <span class="clip-dur">${c.dur.toFixed(1)}s</span>
    </div>`
  ).join('');
}

function renderAssignmentList() {
  const el = document.getElementById('assignment-list');
  if (!el) return;

  if (state.assignments.length === 0) {
    el.innerHTML = ''; return;
  }

  el.innerHTML = state.assignments.map((a, i) => {
      const clip = state.selectedClips[i];
      const name = clip ? clip.name : 'Clip ' + (i + 1);
      return `<div class="assign-item">
        <span class="clip-num">${i + 1}</span>
        <span class="clip-name">${name}</span>
        <span class="assign-tag">${a.presetId}</span>
      </div>`;
    }).join('');
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
  updateAnchorDisplay();
};

window.onIntensityChange = function(value) {
  state.intensity = parseFloat(value);
  document.getElementById('intensity-value').textContent = Math.round(value * 100) + '%';
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
