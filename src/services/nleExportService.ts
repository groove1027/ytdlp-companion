/**
 * nleExportService.ts
 *
 * NLE(Non-Linear Editor) 프로젝트 내보내기 서비스
 * - Premiere Pro / DaVinci Resolve: FCP XML (xmeml v5)
 * - CapCut: FCP XML + draft JSON + SRT + 영상 ZIP 패키지
 * - VREW: SRT + 영상 ZIP 패키지 (VREW는 XML import 미지원, SRT만 지원)
 */

import type {
  VideoSceneRow,
  VideoAnalysisPreset,
  EdlEntry,
  SourceVideoFile,
  ScriptLine,
  UnifiedSceneTiming,
  NarrationSyncSceneTiming,
  NleMotionInterpolation,
  NleMotionKeyframe,
  NleMotionTrack,
} from '../types';
import { buildNarrationSyncedTimeline, breakDialogueLines } from './narrationSyncService';
import type { NarrationLineLike } from './narrationSyncService';
import { compileNleMotionTrack } from './nleMotionExport';
import { OVERSCALE } from './webcodecs/kenBurnsEngine';

interface ExportNarrationLine extends NarrationLineLike {
  sceneId?: string;
  audioUrl?: string;
  audioFileName?: string;
}

// ──────────────────────────────────────────────
// 유틸
// ──────────────────────────────────────────────

function parseDuration(dur: string): number {
  const m = dur.match(/([\d.]+)\s*(?:초|s(?:ec(?:onds?)?)?)/i);
  return m && parseFloat(m[1]) > 0 ? parseFloat(m[1]) : 3;
}

function timecodeToSeconds(tc: string): number {
  const m = tc.match(/(\d+):(\d+)(?:\.(\d+))?/);
  if (!m) return 0;
  return parseInt(m[1], 10) * 60 + parseInt(m[2], 10) + (m[3] ? parseFloat('0.' + m[3]) : 0);
}

/** 초 → SRT 타임코드 (00:00:03,000) */
function secondsToSrtTime(s: number): string {
  const total = Math.max(0, s);
  let ms = Math.round((total % 1) * 1000);
  let sec = Math.floor(total % 60);
  if (ms >= 1000) { ms -= 1000; sec += 1; }
  const m = Math.floor((total % 3600) / 60);
  const h = Math.floor(total / 3600);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')},${String(ms).padStart(3, '0')}`;
}

/** 초 → FCP 타임코드 (HH:MM:SS:FF) */
function secondsToFcpTc(s: number, fps: number): string {
  const total = Math.max(0, s);
  const f = Math.floor((total % 1) * fps);
  const sec = Math.floor(total % 60);
  const m = Math.floor((total % 3600) / 60);
  const h = Math.floor(total / 3600);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}:${String(f).padStart(2, '0')}`;
}

/**
 * XML 텍스트 이스케이프 + 이모지/특수 심볼 제거
 * [FIX] 이모지(U+10000~U+10FFFF 보충 유니코드)가 FCP XML에 포함되면
 * Premiere Pro/CapCut/VREW의 XML 파서가 깨져서 미디어 링크 실패 발생.
 * BMP(U+0000~U+FFFF) 내 문자만 허용하여 모든 NLE 소프트웨어 호환성 보장.
 */
function escXml(s: string): string {
  return s
    .replace(/[\u{10000}-\u{10FFFF}]/gu, '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');
}

/**
 * 파일명에서 이모지·특수문자 제거 — NLE(Premiere/CapCut/VREW) pathurl 호환성 보장.
 * 허용: 영문, 숫자, 한글(가-힣), 일본어(ぁ-ヶ), 중국어(一-龥), 하이픈, 언더스코어
 * 공백 → 언더스코어, 연속 언더스코어 → 단일, 양쪽 trim, 확장자 보장
 * [FIX] 공백을 언더스코어로 변환하여 NLE pathurl 깨짐 방지
 */
function sanitizeFileName(name: string): string {
  // 확장자 분리
  const extMatch = name.match(/\.[a-zA-Z0-9]{2,5}$/);
  const ext = extMatch ? extMatch[0] : '';
  const base = ext ? name.slice(0, -ext.length) : name;
  const cleaned = base
    .replace(/[^\w가-힣ぁ-ヶ一-龥\s\-_]/g, '')
    .replace(/\s+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '')
    || 'video';
  return cleaned + ext;
}

/**
 * 프로젝트명/ZIP 파일명 정제 — NLE 소프트웨어 호환성 보장
 * sanitizeFileName과 동일 로직이나 확장자 없이 프로젝트명 전용
 * [FIX] 공백→언더스코어, 이모지/특수문자 제거, 빈 결과 폴백
 */
export function sanitizeProjectName(name: string, maxLen = 40): string {
  return name
    .replace(/[^\w가-힣ぁ-ヶ一-龥\s\-_]/g, '')
    .replace(/\s+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, maxLen)
    || 'project';
}

/** 장면 모드 → Premiere Pro 라벨 색상 (타임라인 시각 구분) */
function modeToLabelColor(mode: string): string {
  const m = (mode || '').toUpperCase().replace(/[\[\]]/g, '').trim();
  if (m.includes('S-내레이션') || m.includes('S-나레이션') || m === 'SN') return 'Caribbean';
  if (m.includes('S')) return 'Forest';
  if (m.includes('N')) return 'Cerulean';
  if (m.includes('A')) return 'Mango';
  return 'Iris';
}

/** 실측 FPS → xmeml v5 timebase + NTSC 플래그 매핑 */
function fpsToNtsc(fps: number): { ntsc: boolean; timebase: number } {
  // 임계값 0.01 — 23.976(NTSC)과 24.000(non-NTSC)의 차이=0.024이므로 0.05는 너무 넓음
  if (Math.abs(fps - 23.976) < 0.01) return { ntsc: true, timebase: 24 };
  if (Math.abs(fps - 29.97) < 0.01) return { ntsc: true, timebase: 30 };
  if (Math.abs(fps - 59.94) < 0.01) return { ntsc: true, timebase: 60 };
  return { ntsc: false, timebase: Math.round(fps) };
}

function hasLandscapeAspect(width: number, height: number): boolean {
  if (width <= 0 || height <= 0) return false;
  return width >= height;
}

function getSubtitleOrigin(width: number, height: number): { main: string; effect: string } {
  // 9:16(숏폼): 얼굴 영역(중상단) 회피를 위해 하단 고정
  if (!hasLandscapeAspect(width, height)) {
    return { main: '0 -0.38', effect: '0 -0.2' };
  }
  // 16:9(롱폼): 표준 lower-third
  return { main: '0 -0.35', effect: '0 -0.17' };
}

/** 숏폼 자막 줄바꿈 */
function breakLines(text: string, maxChars: number = 14): string {
  if (text.length <= maxChars) return text;
  const mid = Math.ceil(text.length / 2);
  const spaceAfter = text.indexOf(' ', mid);
  const spaceBefore = text.lastIndexOf(' ', mid);
  const breakAt = spaceAfter !== -1 && spaceAfter - mid < 8 ? spaceAfter
    : spaceBefore > 0 ? spaceBefore : mid;
  return text.slice(0, breakAt).trim() + '\n' + text.slice(breakAt).trim();
}

/** UUID v4 생성 (캡컷 프로젝트용) */
function uuid(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = Math.random() * 16 | 0;
    return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
  }).toUpperCase();
}

/** 초 → 마이크로초 (캡컷 시간 단위) */
function toUs(sec: number): number {
  return Math.round(sec * 1_000_000);
}

type CapCutDesktopPlatform = 'mac' | 'windows';

interface CapCutProjectScaffoldIds {
  draftFolderId: string;
  draftId: string;
  timelineId: string;
  timelineProjectId: string;
}

interface CapCutProjectPathInfo {
  draftFoldPath: string;
  draftRootPath: string;
  draftPathPlaceholder: string;
}

const CAPCUT_MAC_INSTALLER_NAME = 'install_capcut_project.command';
const CAPCUT_WINDOWS_BATCH_INSTALLER_NAME = 'install_capcut_project.bat';
const CAPCUT_WINDOWS_POWERSHELL_INSTALLER_NAME = 'install_capcut_project.ps1';
const CAPCUT_DRAFT_EXTRA_BASE64 = 'aQUAAABpAAAAAGVpAAAAAAIAAAB7fXpCe7g=';
const CAPCUT_CRYPTO_KEY_STORE_BASE64 = 'AAAAsngBLYw9DoIwHMX/Ytw5iJVAwIIjpcbZuJNam9gotIGSSOJVjKMbg2dwY3H0FB7BWIzT+8jvvTsAjA+ireE2OB+uViZc6r2octuDazNMH9Gzfy+CDeq6T/+6uH/AtFrAyAKO0kaqkh1zrkojTubXgtNUElbWnLW3FrVqKi5qj6tiK0s2DLyMUhwTnCKckRiFy3mA4hgHKKJpkvjE9wnFOWt2Us2KkA2fX7XXM/Y=';

function detectCapCutDesktopPlatform(): CapCutDesktopPlatform {
  if (typeof navigator !== 'undefined') {
    const nav = navigator as Navigator & { userAgentData?: { platform?: string } };
    const platform = String(
      nav.userAgentData?.platform
      || nav.platform
      || nav.userAgent
      || '',
    ).toLowerCase();
    if (platform.includes('win')) return 'windows';
  }
  return 'mac';
}

/** CapCut 프로젝트 루트 경로 */
function getCapCutDraftRoot(): string {
  return '/com.lveditor.draft';
}

function getCapCutDraftFolderPath(draftFolderId: string): string {
  return `${getCapCutDraftRoot()}/${draftFolderId}`;
}

function buildCapCutPathInfo(draftFolderId: string): CapCutProjectPathInfo {
  return {
    draftFoldPath: getCapCutDraftFolderPath(draftFolderId),
    draftRootPath: getCapCutDraftRoot(),
    draftPathPlaceholder: `##_draftpath_placeholder_${draftFolderId}_##`,
  };
}

function buildCapCutDraftSettings(
  nowSec: number,
  width?: number,
  height?: number,
  platform: CapCutDesktopPlatform = detectCapCutDesktopPlatform(),
  realEditKeys = 1,
  realEditSeconds = 0,
): string {
  return [
    '[General]',
    `cloud_last_modify_platform=${platform}`,
    ...(width && height ? [`custom_ratio_height=${height}`, `custom_ratio_width=${width}`] : []),
    `draft_create_time=${nowSec}`,
    `draft_last_edit_time=${nowSec}`,
    `real_edit_keys=${Math.max(1, Math.round(realEditKeys))}`,
    `real_edit_seconds=${Math.max(0, Math.round(realEditSeconds))}`,
    'timeline_use_close_gap=true',
    'timeline_use_split_scene=true',
    '',
  ].join('\n');
}

function buildCapCutPlatformInfo(platform: CapCutDesktopPlatform = detectCapCutDesktopPlatform()): {
  app_id: number;
  app_source: string;
  app_version: string;
  device_id: string;
  hard_disk_id: string;
  mac_address: string;
  os: string;
  os_version: string;
} {
  return {
    app_id: 359289,
    app_source: 'cc',
    app_version: '8.1.1',
    device_id: '',
    hard_disk_id: '',
    mac_address: '',
    os: platform,
    os_version: '',
  };
}

function buildCapCutDraftMetaMaterials(): Array<{ type: number; value: never[] }> {
  return [
    { type: 0, value: [] },
    { type: 1, value: [] },
    { type: 2, value: [] },
    { type: 3, value: [] },
    { type: 6, value: [] },
    { type: 7, value: [] },
    { type: 8, value: [] },
  ];
}

function buildCapCutDraftMetaInfo(params: {
  draftFolderId: string;
  draftId: string;
  title: string;
  tmDuration: number;
  tmDraftModifiedUs: number;
  draftTimelineMaterialsSize?: number;
  draftCover?: string;
}): string {
  const {
    draftFolderId,
    draftId,
    title,
    tmDuration,
    tmDraftModifiedUs,
    draftTimelineMaterialsSize = 0,
    draftCover = 'draft_cover.jpg',
  } = params;
  const pathInfo = buildCapCutPathInfo(draftFolderId);

  return JSON.stringify({
    cloud_draft_cover: false,
    cloud_draft_sync: false,
    cloud_package_completed_time: '',
    draft_cloud_capcut_purchase_info: '',
    draft_cloud_last_action_download: false,
    draft_cloud_package_type: '',
    draft_cloud_purchase_info: '',
    draft_cloud_template_id: '',
    draft_cloud_tutorial_info: '',
    draft_cloud_videocut_purchase_info: '',
    draft_cover: draftCover,
    draft_deeplink_url: '',
    draft_enterprise_info: {
      draft_enterprise_extra: '',
      draft_enterprise_id: '',
      draft_enterprise_name: '',
      enterprise_material: [],
    },
    draft_fold_path: pathInfo.draftFoldPath,
    draft_id: draftId,
    draft_is_ae_produce: false,
    draft_is_ai_packaging_used: false,
    draft_is_ai_shorts: false,
    draft_is_ai_translate: false,
    draft_is_article_video_draft: false,
    draft_is_cloud_temp_draft: false,
    draft_is_from_deeplink: 'false',
    draft_is_invisible: false,
    draft_is_web_article_video: false,
    draft_materials: buildCapCutDraftMetaMaterials(),
    draft_materials_copied_info: [],
    draft_name: title,
    draft_need_rename_folder: false,
    draft_new_version: '',
    draft_removable_storage_device: '',
    draft_root_path: pathInfo.draftRootPath,
    draft_segment_extra_info: [],
    draft_timeline_materials_size_: draftTimelineMaterialsSize,
    draft_type: '',
    draft_web_article_video_enter_from: '',
    tm_draft_cloud_completed: '',
    tm_draft_cloud_entry_id: -1,
    tm_draft_cloud_modified: 0,
    tm_draft_cloud_parent_entry_id: -1,
    tm_draft_cloud_space_id: -1,
    tm_draft_cloud_user_id: -1,
    tm_draft_create: tmDraftModifiedUs,
    tm_draft_modified: tmDraftModifiedUs,
    tm_draft_removed: 0,
    tm_duration: tmDuration,
  });
}

function decodeCapCutTemplateBinary(base64: string): Uint8Array {
  const binary = globalThis.atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

async function buildCapCutDraftCoverBlob(width = 320, height = 180): Promise<Blob> {
  if (typeof document === 'undefined') {
    return new Blob([], { type: 'image/jpeg' });
  }

  const canvas = document.createElement('canvas');
  canvas.width = Math.max(2, Math.round(width));
  canvas.height = Math.max(2, Math.round(height));
  const ctx = canvas.getContext('2d');
  if (ctx) {
    const gradient = ctx.createLinearGradient(0, 0, canvas.width, canvas.height);
    gradient.addColorStop(0, '#111827');
    gradient.addColorStop(1, '#374151');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }

  const blob = await new Promise<Blob | null>((resolve) => {
    canvas.toBlob((value) => resolve(value), 'image/jpeg', 0.84);
  });
  return blob || new Blob([], { type: 'image/jpeg' });
}

function buildCapCutAttachmentScriptVideo(): string {
  return JSON.stringify({
    script_video: {
      attachment_valid: false,
      language: '',
      overdub_recover: [],
      overdub_sentence_ids: [],
      parts: [],
      sync_subtitle: false,
      translate_segments: [],
      translate_type: '',
      version: '1.0.0',
    },
  });
}

function buildCapCutAttachmentActionScene(): string {
  return JSON.stringify({
    action_scene: {
      removed_segments: [],
      segment_infos: [],
    },
  });
}

function buildCapCutCooperateCreate(): string {
  return JSON.stringify({
    roomInfo: {
      room_id: '',
    },
  });
}

function buildCapCutOpaqueDraftExtra(): Uint8Array {
  return decodeCapCutTemplateBinary(CAPCUT_DRAFT_EXTRA_BASE64);
}

function buildCapCutOpaqueCryptoKeyStore(): Uint8Array {
  return decodeCapCutTemplateBinary(CAPCUT_CRYPTO_KEY_STORE_BASE64);
}

function buildCapCutCanvasMaterial(id: string): Record<string, unknown> {
  return {
    album_image: '',
    blur: 0.0,
    color: '',
    id,
    image: '',
    image_id: '',
    image_name: '',
    source_platform: 0,
    team_id: '',
    type: 'canvas_color',
  };
}

function buildCapCutMaterialAnimation(id: string): Record<string, unknown> {
  return {
    animations: [],
    id,
    multi_language_current: 'none',
    type: 'sticker_animation',
  };
}

function buildCapCutContainedMaterialPath(
  draftFolderId: string,
  category: 'audio' | 'image' | 'video',
  fileName: string,
): string {
  return `${buildCapCutPathInfo(draftFolderId).draftPathPlaceholder}/materials/${category}/${fileName}`;
}

function buildCapCutMacInstallerScript(projectFolderId: string): string {
  return [
    '#!/bin/bash',
    'set -euo pipefail',
    '',
    `PROJECT_ID="${projectFolderId}"`,
    'SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"',
    'TARGET_ROOT="$HOME/Movies/CapCut/User Data/Projects/com.lveditor.draft"',
    'SOURCE_PROJECT_PATH="$SCRIPT_DIR/$PROJECT_ID"',
    '',
    'if [ ! -d "$SOURCE_PROJECT_PATH" ] && [ -f "$SCRIPT_DIR/draft_content.json" ]; then',
    '  SOURCE_PROJECT_PATH="$SCRIPT_DIR"',
    'fi',
    '',
    'if [ ! -f "$SOURCE_PROJECT_PATH/draft_content.json" ]; then',
    '  echo "CapCut 프로젝트 폴더를 찾지 못했습니다: $SOURCE_PROJECT_PATH"',
    '  if [ -t 0 ]; then read -r -p "Enter를 누르면 종료합니다." _; fi',
    '  exit 1',
    'fi',
    '',
    'TARGET_PROJECT_PATH="$TARGET_ROOT/$PROJECT_ID"',
    'mkdir -p "$TARGET_ROOT"',
    '',
    'if [ "$SOURCE_PROJECT_PATH" != "$TARGET_PROJECT_PATH" ]; then',
    '  rm -rf "$TARGET_PROJECT_PATH"',
    '  cp -R "$SOURCE_PROJECT_PATH" "$TARGET_PROJECT_PATH"',
    'fi',
    '',
    'export PLACEHOLDER="##_draftpath_placeholder_${PROJECT_ID}_##"',
    'export TARGET_PROJECT_PATH',
    'export TARGET_ROOT',
    '',
    'find "$TARGET_PROJECT_PATH" -type f \\( -name "draft_content.json" -o -name "draft_info.json" -o -name "draft_meta_info.json" -o -path "*/Timelines/*/draft_info.json" \\) -print0 | while IFS= read -r -d "" file; do',
    "  perl -0pi -e '",
    '    s#\\Q$ENV{PLACEHOLDER}\\E#$ENV{TARGET_PROJECT_PATH}#g;',
    '    s#"path":"materials/#"path":"$ENV{TARGET_PROJECT_PATH}/materials/#g;',
    '    s#"media_path":"materials/#"media_path":"$ENV{TARGET_PROJECT_PATH}/materials/#g;',
    '    s#"draft_fold_path":"[^"]*"#"draft_fold_path":"$ENV{TARGET_PROJECT_PATH}"#g;',
    '    s#"draft_root_path":"[^"]*"#"draft_root_path":"$ENV{TARGET_ROOT}"#g;',
    "  ' \"$file\"",
    'done',
    '',
    'open -a "CapCut" "$TARGET_PROJECT_PATH" || true',
    'echo ""',
    'echo "CapCut 프로젝트 설치 완료: $TARGET_PROJECT_PATH"',
    'if [ -t 0 ]; then read -r -p "Enter를 누르면 종료합니다." _; fi',
    '',
  ].join('\n');
}

function buildCapCutWindowsPowerShellInstallerScript(projectFolderId: string): string {
  return [
    "$ErrorActionPreference = 'Stop'",
    `$ProjectId = '${projectFolderId}'`,
    '$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path',
    "$TargetRoot = Join-Path $env:LOCALAPPDATA 'CapCut\\User Data\\Projects\\com.lveditor.draft'",
    '$SourceProjectPath = Join-Path $ScriptDir $ProjectId',
    '',
    "if (-not (Test-Path $SourceProjectPath) -and (Test-Path (Join-Path $ScriptDir 'draft_content.json'))) {",
    '  $SourceProjectPath = $ScriptDir',
    '}',
    '',
    "if (-not (Test-Path (Join-Path $SourceProjectPath 'draft_content.json'))) {",
    "  throw \"CapCut 프로젝트 폴더를 찾지 못했습니다: $SourceProjectPath\"",
    '}',
    '',
    '$TargetProjectPath = Join-Path $TargetRoot $ProjectId',
    'New-Item -ItemType Directory -Force -Path $TargetRoot | Out-Null',
    '',
    'if ($SourceProjectPath -ne $TargetProjectPath) {',
    '  Remove-Item $TargetProjectPath -Recurse -Force -ErrorAction SilentlyContinue',
    '  Copy-Item $SourceProjectPath $TargetProjectPath -Recurse -Force',
    '}',
    '',
    '$Placeholder = "##_draftpath_placeholder_$ProjectId_##"',
    "$TargetProjectPathJson = $TargetProjectPath -replace '\\\\', '/'",
    "$TargetRootJson = $TargetRoot -replace '\\\\', '/'",
    '',
    '$JsonFiles = Get-ChildItem -Path $TargetProjectPath -File -Recurse | Where-Object {',
    "  $_.Name -in @('draft_content.json', 'draft_info.json', 'draft_meta_info.json') -or",
    "  $_.FullName -like '*\\Timelines\\*\\draft_info.json'",
    '}',
    '',
    'foreach ($file in $JsonFiles) {',
    '  $content = Get-Content -Path $file.FullName -Raw -Encoding UTF8',
    '  $content = $content.Replace($Placeholder, $TargetProjectPathJson)',
    "  $content = $content.Replace('\"path\":\"materials/', '\"path\":\"' + $TargetProjectPathJson + '/materials/')",
    "  $content = $content.Replace('\"media_path\":\"materials/', '\"media_path\":\"' + $TargetProjectPathJson + '/materials/')",
    "  $content = [regex]::Replace($content, '\"draft_fold_path\":\"[^\"]*\"', '\"draft_fold_path\":\"' + $TargetProjectPathJson + '\"')",
    "  $content = [regex]::Replace($content, '\"draft_root_path\":\"[^\"]*\"', '\"draft_root_path\":\"' + $TargetRootJson + '\"')",
    '  Set-Content -Path $file.FullName -Value $content -Encoding UTF8',
    '}',
    '',
    '$CapCutCandidates = @(',
    "  (Join-Path $env:LOCALAPPDATA 'CapCut\\CapCut.exe'),",
    "  (Join-Path $env:ProgramFiles 'CapCut\\CapCut.exe'),",
    "  (Join-Path ${env:ProgramFiles(x86)} 'CapCut\\CapCut.exe')",
    ') | Where-Object { $_ -and (Test-Path $_) }',
    '',
    'if ($CapCutCandidates.Count -gt 0) {',
    '  Start-Process -FilePath $CapCutCandidates[0] | Out-Null',
    '}',
    '',
    'Write-Host ""',
    'Write-Host "CapCut 프로젝트 설치 완료: $TargetProjectPath"',
    'if ([Environment]::UserInteractive) {',
    '  Read-Host "Enter를 누르면 종료합니다." | Out-Null',
    '}',
    '',
  ].join('\r\n');
}

function buildCapCutWindowsBatchInstallerScript(): string {
  return [
    '@echo off',
    'setlocal',
    `powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0${CAPCUT_WINDOWS_POWERSHELL_INSTALLER_NAME}"`,
    'if errorlevel 1 pause',
    '',
  ].join('\r\n');
}

function buildCapCutSegmentShell(params: {
  clip: Record<string, unknown>;
  commonKeyframes: unknown[];
  enableAdjust: boolean;
  extraMaterialRefs: string[];
  materialId: string;
  renderIndex: number;
  sourceDurationUs: number;
  sourceStartUs: number;
  speed: number;
  targetDurationUs: number;
  targetStartUs: number;
  trackRenderIndex: number;
}): Record<string, unknown> {
  const {
    clip,
    commonKeyframes,
    enableAdjust,
    extraMaterialRefs,
    materialId,
    renderIndex,
    sourceDurationUs,
    sourceStartUs,
    speed,
    targetDurationUs,
    targetStartUs,
    trackRenderIndex,
  } = params;

  return {
    caption_info: null,
    cartoon: false,
    clip,
    color_correct_alg_result: '',
    common_keyframes: commonKeyframes,
    desc: '',
    digital_human_template_group_id: '',
    enable_adjust: enableAdjust,
    enable_adjust_mask: false,
    enable_color_adjust_pro: false,
    enable_color_correct_adjust: false,
    enable_color_curves: enableAdjust,
    enable_color_match_adjust: false,
    enable_color_wheels: enableAdjust,
    enable_hsl: false,
    enable_hsl_curves: enableAdjust,
    enable_lut: enableAdjust,
    enable_mask_shadow: false,
    enable_mask_stroke: false,
    enable_smart_color_adjust: false,
    enable_video_mask: enableAdjust,
    extra_material_refs: extraMaterialRefs,
    group_id: '',
    hdr_settings: enableAdjust ? { intensity: 1.0, mode: 1, nits: 1000 } : null,
    id: uuid(),
    intensifies_audio: false,
    is_loop: false,
    is_placeholder: false,
    is_tone_modify: false,
    keyframe_refs: [],
    last_nonzero_volume: 1.0,
    lyric_keyframes: null,
    material_id: materialId,
    raw_segment_id: '',
    render_index: renderIndex,
    render_timerange: { duration: 0, start: 0 },
    responsive_layout: {
      enable: false,
      horizontal_pos_layout: 0,
      size_layout: 0,
      target_follow: '',
      vertical_pos_layout: 0,
    },
    reverse: false,
    source: 'segmentsourcenormal',
    source_timerange: {
      duration: sourceDurationUs,
      start: sourceStartUs,
    },
    speed,
    state: 0,
    target_timerange: {
      duration: targetDurationUs,
      start: targetStartUs,
    },
    template_id: '',
    template_scene: 'default',
    track_attribute: 0,
    track_render_index: trackRenderIndex,
    uniform_scale: { on: true, value: 1.0 },
    visible: true,
    volume: 1.0,
  };
}

function buildCapCutKeyValue(entries: Array<{ segmentId: string; materialName: string }>): string {
  const keyValueEntries = Object.fromEntries(entries.map(({ segmentId, materialName }) => [
    segmentId,
    {
      filter_category: '',
      filter_detail: '',
      is_brand: 0,
      is_from_artist_shop: 0,
      is_vip: '0',
      keywordSource: '',
      materialCategory: 'media',
      materialId: '',
      materialName,
      materialSubcategory: 'local',
      materialSubcategoryId: '',
      materialThirdcategory: '가져오기',
      materialThirdcategoryId: '',
      material_copyright: '',
      material_is_purchased: '',
      rank: '2',
      rec_id: '',
      requestId: '',
      role: '',
      searchId: '',
      searchKeyword: '',
      segmentId,
      team_id: '',
      textTemplateVersion: '',
    },
  ]));

  return JSON.stringify(keyValueEntries);
}

function buildCapCutEmptyMaterialBuckets(): Record<string, never[]> {
  return {
    ai_translates: [],
    audio_balances: [],
    audio_effects: [],
    audio_fades: [],
    audio_pannings: [],
    audio_pitch_shifts: [],
    audio_track_indexes: [],
    audios: [],
    beats: [],
    canvases: [],
    chromas: [],
    color_curves: [],
    common_mask: [],
    digital_human_model_dressing: [],
    digital_humans: [],
    drafts: [],
    effects: [],
    flowers: [],
    green_screens: [],
    handwrites: [],
    head_animations: [],
    hsl: [],
    hsl_curves: [],
    images: [],
    log_color_wheels: [],
    loudnesses: [],
    manual_beautys: [],
    manual_deformations: [],
    material_animations: [],
    material_colors: [],
    multi_language_refs: [],
    placeholder_infos: [],
    placeholders: [],
    plugin_effects: [],
    primary_color_wheels: [],
    realtime_denoises: [],
    shapes: [],
    smart_crops: [],
    smart_relayouts: [],
    smart_relights: [],
    sound_channel_mappings: [],
    speeds: [],
    stickers: [],
    tail_animations: [],
    tail_leaders: [],
    text_templates: [],
    texts: [],
    time_marks: [],
    transitions: [],
    video_effects: [],
    video_radius: [],
    video_shadows: [],
    video_strokes: [],
    video_trackings: [],
    videos: [],
    vocal_beautifys: [],
    vocal_separations: [],
  };
}

function buildCapCutTimelineProject(timelineProjectId: string, mainTimelineId: string, nowUs: number): string {
  return JSON.stringify({
    config: {
      color_space: -1,
      render_index_track_mode_on: false,
      use_float_render: false,
    },
    create_time: nowUs,
    id: timelineProjectId,
    main_timeline_id: mainTimelineId,
    timelines: [
      {
        create_time: nowUs,
        id: mainTimelineId,
        is_marked_delete: false,
        name: '타임라인 01',
        update_time: nowUs,
      },
    ],
    update_time: nowUs,
    version: 0,
  });
}

function buildCapCutAttachmentPcTimeline(): string {
  return JSON.stringify({
    reference_lines_config: {
      horizontal_lines: [],
      is_lock: false,
      is_visible: false,
      vertical_lines: [],
    },
    safe_area_type: 0,
  });
}

function buildCapCutAttachmentPcCommon(): string {
  return JSON.stringify({
    ai_packaging_infos: [],
    ai_packaging_report_info: {
      caption_id_list: [],
      commercial_material: '',
      material_source: '',
      method: '',
      page_from: '',
      style: '',
      task_id: '',
      text_style: '',
      tos_id: '',
      video_category: '',
    },
    broll: {
      ai_packaging_infos: [],
      ai_packaging_report_info: {
        caption_id_list: [],
        commercial_material: '',
        material_source: '',
        method: '',
        page_from: '',
        style: '',
        task_id: '',
        text_style: '',
        tos_id: '',
        video_category: '',
      },
    },
    commercial_music_category_ids: [],
    pc_feature_flag: 0,
    recognize_tasks: [],
    reference_lines_config: {
      horizontal_lines: [],
      is_lock: false,
      is_visible: false,
      vertical_lines: [],
    },
    safe_area_type: 0,
    template_item_infos: [],
    unlock_template_ids: [],
  });
}

function buildCapCutAttachmentEditing(): string {
  return JSON.stringify({
    editing_draft: {
      ai_remove_filter_words: { enter_source: '', right_id: '' },
      ai_shorts_info: { report_params: '', type: 0 },
      crop_info_extra: { crop_mirror_type: 0, crop_rotate: 0.0, crop_rotate_total: 0.0 },
      digital_human_template_to_video_info: { has_upload_material: false, template_type: 0 },
      draft_used_recommend_function: '',
      edit_type: 0,
      eye_correct_enabled_multi_face_time: 0,
      has_adjusted_render_layer: false,
      image_ai_chat_info: {
        before_chat_edit: false,
        draft_modify_time: 0,
        message_id: '',
        model_name: '',
        need_restore: false,
        picture_id: '',
        prompt_from: '',
        sugs_info: [],
      },
      is_open_expand_player: false,
      is_template_text_ai_generate: false,
      is_use_adjust: false,
      is_use_ai_expand: false,
      is_use_ai_remove: false,
      is_use_audio_separation: false,
      is_use_chroma_key: false,
      is_use_curve_speed: false,
      is_use_digital_human: false,
      is_use_edit_multi_camera: false,
      is_use_lip_sync: false,
      is_use_lock_object: false,
      is_use_loudness_unify: true,
      is_use_noise_reduction: false,
      is_use_one_click_beauty: false,
      is_use_one_click_ultra_hd: false,
      is_use_retouch_face: false,
      is_use_smart_adjust_color: false,
      is_use_smart_body_beautify: false,
      is_use_smart_motion: false,
      is_use_subtitle_recognition: false,
      is_use_text_to_audio: false,
      material_edit_session: { material_edit_info: [], session_id: '', session_time: 0 },
      paste_segment_list: [],
      profile_entrance_type: '',
      publish_enter_from: '',
      publish_type: '',
      single_function_type: 0,
      text_convert_case_types: [],
      version: '1.0.0',
      video_recording_create_draft: '',
    },
  });
}

function addCapCutMainTimelineMirror(params: {
  zip: { file: (path: string, data: string | Blob | Uint8Array) => unknown };
  projectFolderId: string;
  mainTimelineId: string;
  draftJson: string;
  attachmentPcCommonJson: string;
  attachmentEditingJson: string;
  attachmentPcTimelineJson: string;
  attachmentScriptVideoJson: string;
  attachmentActionSceneJson: string;
  draftExtra: Uint8Array;
  draftCover: Blob;
}): void {
  const {
    zip,
    projectFolderId,
    mainTimelineId,
    draftJson,
    attachmentPcCommonJson,
    attachmentEditingJson,
    attachmentPcTimelineJson,
    attachmentScriptVideoJson,
    attachmentActionSceneJson,
    draftExtra,
    draftCover,
  } = params;
  const timelineBase = `${projectFolderId}/Timelines/${mainTimelineId}`;

  zip.file(`${timelineBase}/draft_info.json`, draftJson);
  zip.file(`${timelineBase}/attachment_pc_common.json`, attachmentPcCommonJson);
  zip.file(`${timelineBase}/attachment_editing.json`, attachmentEditingJson);
  zip.file(`${timelineBase}/common_attachment/attachment_pc_timeline.json`, attachmentPcTimelineJson);
  zip.file(`${timelineBase}/common_attachment/attachment_script_video.json`, attachmentScriptVideoJson);
  zip.file(`${timelineBase}/common_attachment/attachment_action_scene.json`, attachmentActionSceneJson);
  zip.file(`${timelineBase}/draft.extra`, draftExtra);
  zip.file(`${timelineBase}/draft_cover.jpg`, draftCover);
  zip.file(`${timelineBase}/template.tmp`, '');
  zip.file(`${timelineBase}/template-2.tmp`, '');
}

function addCapCutDesktopInstallerFiles(params: {
  zip: { file: (path: string, data: string | Blob | Uint8Array, options?: Record<string, unknown>) => unknown };
  projectFolderId: string;
}): void {
  const { zip, projectFolderId } = params;

  zip.file(CAPCUT_MAC_INSTALLER_NAME, buildCapCutMacInstallerScript(projectFolderId), {
    unixPermissions: '755',
  });
  zip.file(CAPCUT_WINDOWS_POWERSHELL_INSTALLER_NAME, buildCapCutWindowsPowerShellInstallerScript(projectFolderId));
  zip.file(CAPCUT_WINDOWS_BATCH_INSTALLER_NAME, buildCapCutWindowsBatchInstallerScript());
}

function buildCapCutTimelineLayout(mainTimelineId: string): string {
  return JSON.stringify({
    dockItems: [
      {
        dockIndex: 0,
        ratio: 1,
        timelineIds: [mainTimelineId],
        timelineNames: ['타임라인 01'],
      },
    ],
    layoutOrientation: 1,
  });
}

function buildCapCutDraftVirtualStore(): string {
  return JSON.stringify({
    draft_materials: [],
    draft_virtual_store: [
      {
        type: 0,
        value: [{
          creation_time: 0,
          display_name: '',
          filter_type: 0,
          id: '',
          import_time: 0,
          import_time_us: 0,
          sort_sub_type: 0,
          sort_type: 0,
          subdraft_filter_type: 0,
        }],
      },
      { type: 1, value: [] },
      { type: 2, value: [] },
    ],
  });
}

function buildCapCutDraftBizConfig(mainTimelineId: string, trackIds: string[]): string {
  const trackSettings = Object.fromEntries(trackIds.map((trackId) => [trackId, { height: 74 }]));
  return JSON.stringify({
    timeline_settings: {
      [mainTimelineId]: {
        linkage_enabled: true,
      },
    },
    track_settings: trackSettings,
  });
}

function buildCapCutDraftAgencyConfig(): string {
  return JSON.stringify({
    is_auto_agency_enabled: false,
    is_auto_agency_popup: false,
    is_single_agency_mode: false,
    marterials: null,
    use_converter: false,
    video_resolution: 720,
  });
}

function buildCapCutPerformanceOptInfo(): string {
  return JSON.stringify({
    manual_cancle_precombine_segs: null,
    need_auto_precombine_segs: null,
  });
}

// ──────────────────────────────────────────────
// 장면 → 타이밍 정보 추출
// ──────────────────────────────────────────────

interface SceneTiming {
  index: number;
  startSec: number;      // 소스 영상 내 시작점
  endSec: number;        // 소스 영상 내 종료점
  durationSec: number;   // 클립 길이
  tlStartSec: number;    // 타임라인 누적 시작점
  tlEndSec: number;      // 타임라인 누적 종료점
  text: string;          // 나레이션/대사
  effectText: string;    // 효과자막
}

function getVideoAnalysisMainText(scene: VideoSceneRow): string {
  return (scene.audioContent || scene.dialogue || scene.sceneDesc || '').trim();
}

function normalizeNarrationComparisonText(text: string): string {
  return text
    .normalize('NFKC')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function parseVideoAnalysisSceneWindow(scene: VideoSceneRow): { startSec: number; endSec: number; durationSec: number } | null {
  const rawTc = scene.timecodeSource || scene.sourceTimeline || scene.timeline || '';
  const range = rawTc.match(/(\d+:\d+(?:\.\d+)?)\s*[~\-–—/]\s*(\d+:\d+(?:\.\d+)?)/);
  if (!range) return null;
  const startSec = timecodeToSeconds(range[1]);
  const endSec = timecodeToSeconds(range[2]);
  if (!Number.isFinite(startSec) || !Number.isFinite(endSec) || endSec <= startSec) return null;
  return {
    startSec,
    endSec,
    durationSec: Math.max(0.1, endSec - startSec),
  };
}

export function buildVideoAnalysisSceneLineId(versionId: number | string, sceneIndex: number): string {
  return `video-analysis:${versionId}:${sceneIndex}`;
}

export function buildVideoAnalysisNarrationLines(params: {
  scenes: VideoSceneRow[];
  soundLines: Array<Pick<ScriptLine, 'audioUrl' | 'duration' | 'endTime' | 'sceneId' | 'startTime' | 'text' | 'ttsStatus'>>;
  versionId?: number | string;
}): Array<{ audioUrl?: string; duration?: number; index: number; sceneId?: string; startTime?: number }> {
  const { scenes, soundLines, versionId } = params;
  if (scenes.length === 0 || soundLines.length === 0) return [];

  const audioLineGroups = new Map<string, Array<Pick<ScriptLine, 'audioUrl' | 'duration' | 'endTime' | 'sceneId' | 'startTime' | 'text' | 'ttsStatus'>>>();
  for (const line of soundLines) {
    if (!line.sceneId || !line.audioUrl) continue;
    const group = audioLineGroups.get(line.sceneId) || [];
    group.push(line);
    audioLineGroups.set(line.sceneId, group);
  }

  const sceneIdKeys = versionId == null
    ? []
    : scenes.map((_, sceneIndex) => buildVideoAnalysisSceneLineId(versionId, sceneIndex));
  const hasSceneIdMatches = sceneIdKeys.some((sceneId) => (audioLineGroups.get(sceneId)?.length || 0) > 0);
  if (hasSceneIdMatches && sceneIdKeys.some((sceneId) => (audioLineGroups.get(sceneId)?.length || 0) > 1)) {
    return [];
  }

  const canUseSceneIdMatching = hasSceneIdMatches;
  const canUseLegacyIndexMatching = !canUseSceneIdMatching
    && soundLines.length === scenes.length
    && scenes.every((scene, sceneIndex) => {
      const sceneText = normalizeNarrationComparisonText(getVideoAnalysisMainText(scene));
      const lineText = normalizeNarrationComparisonText(soundLines[sceneIndex]?.text || '');
      return sceneText === lineText;
    });

  if (!canUseSceneIdMatching && !canUseLegacyIndexMatching) {
    return [];
  }

  return scenes.map((scene, sceneIndex) => {
    const matchedLine = canUseSceneIdMatching
      ? audioLineGroups.get(sceneIdKeys[sceneIndex])?.[0] || null
      : soundLines[sceneIndex] || null;
    const timing = parseVideoAnalysisSceneWindow(scene);
    const fallbackDuration = timing?.durationSec ?? parseDuration(scene.duration);
    const explicitDuration = typeof matchedLine?.duration === 'number' && Number.isFinite(matchedLine.duration) && matchedLine.duration > 0
      ? matchedLine.duration
      : null;
    const inferredDuration = typeof matchedLine?.startTime === 'number'
      && Number.isFinite(matchedLine.startTime)
      && typeof matchedLine?.endTime === 'number'
      && Number.isFinite(matchedLine.endTime)
      && matchedLine.endTime > matchedLine.startTime
      ? matchedLine.endTime - matchedLine.startTime
      : null;
    const duration = explicitDuration ?? inferredDuration ?? fallbackDuration;
    const startTime = typeof matchedLine?.startTime === 'number' && Number.isFinite(matchedLine.startTime)
      ? matchedLine.startTime
      : timing?.startSec;

    if (!matchedLine?.audioUrl) {
      return { duration: fallbackDuration, index: sceneIndex, startTime };
    }

    return {
      audioUrl: matchedLine.audioUrl,
      duration: Math.max(0.1, duration),
      index: sceneIndex,
      sceneId: matchedLine.sceneId,
      startTime,
    };
  });
}

function extractTimings(scenes: VideoSceneRow[], preset?: VideoAnalysisPreset): SceneTiming[] {
  const result: SceneTiming[] = [];
  let accTime = 0;
  let cumTime = 0; // 타임라인 누적 위치

  for (let i = 0; i < scenes.length; i++) {
    const s = scenes[i];
    const dur = parseDuration(s.duration);

    // 보정된 소스 타임코드가 있으면 우선 사용
    const srcTc = s.timecodeSource || s.sourceTimeline || '';
    const range = srcTc.match(/(\d+:\d+(?:\.\d+)?)\s*[~\-–—]\s*(\d+:\d+(?:\.\d+)?)/);

    let startSec: number;
    let endSec: number;

    if (range) {
      startSec = timecodeToSeconds(range[1]);
      endSec = timecodeToSeconds(range[2]);
    } else {
      // [FIX] 단일 타임코드 ("00:26.000")도 소스 시작점으로 사용
      const singleTc = srcTc.match(/(\d+:\d+(?:\.\d+)?)/);
      if (singleTc) {
        startSec = timecodeToSeconds(singleTc[1]);
        endSec = startSec + dur;
      } else {
        startSec = accTime;
        endSec = accTime + dur;
      }
    }

    // [FIX] 음수/0 클립 방지 — endSec 교정 후 clipDur 계산
    if (endSec <= startSec) {
      endSec = startSec + Math.max(0.1, dur);
    }
    const clipDur = endSec - startSec;
    const mainText = preset === 'snack'
      ? (s.dialogue || s.audioContent || s.sceneDesc)
      : getVideoAnalysisMainText(s);

    result.push({
      index: i,
      startSec,
      endSec,
      durationSec: clipDur,
      tlStartSec: cumTime,
      tlEndSec: cumTime + clipDur,
      text: mainText || '',
      effectText: s.effectSub || '',
    });

    accTime = endSec;
    cumTime += clipDur;
  }
  return result;
}

// ──────────────────────────────────────────────
// FCP XML (xmeml v5) — Premiere Pro / DaVinci
// ──────────────────────────────────────────────

export function generateFcpXml(params: {
  scenes: VideoSceneRow[];
  title: string;
  videoFileName: string;
  fps?: number;
  width?: number;
  height?: number;
  preset?: VideoAnalysisPreset;
  videoDurationSec?: number;
  narrationLines?: ExportNarrationLine[];
}): string {
  const { scenes, title, videoFileName: rawVideoFileName, fps = 30, width = 1080, height = 1920, preset, videoDurationSec, narrationLines = [] } = params;
  const videoFileName = sanitizeFileName(rawVideoFileName);
  const syncTimeline = buildNarrationSyncedTimeline(scenes, narrationLines, preset);
  const nsTimings = syncTimeline.scenes;
  // 하위 호환: 기존 코드가 SceneTiming 필드를 사용하므로 매핑
  const timings: SceneTiming[] = nsTimings.map(t => ({
    index: t.sceneIndex,
    startSec: t.sourceStartSec + t.trimStartSec,
    endSec: t.sourceStartSec + t.trimEndSec,
    durationSec: t.targetDurationSec,
    tlStartSec: t.timelineStartSec,
    tlEndSec: t.timelineEndSec,
    text: t.subtitleSegments.map(s => s.text).join(' '),
    effectText: t.effectSubtitleSegments.map(s => s.text).join(' '),
  }));
  if (timings.length === 0) return '';

  const totalDurSec = timings[timings.length - 1].tlEndSec;
  const totalFrames = Math.ceil(totalDurSec * fps);
  const safeTitle = escXml(title);
  const safeFileName = escXml(videoFileName);
  const { ntsc, timebase } = fpsToNtsc(fps);
  const ntscStr = ntsc ? 'TRUE' : 'FALSE';
  const tcFormat = ntsc ? 'DF' : 'NDF';
  const toFrames = (sec: number) => Math.round(sec * fps);
  const subtitleOrigin = getSubtitleOrigin(width, height);
  // [FIX] 소스 영상 전체 길이 = max(실제 비디오 길이, 최대 타임코드 끝점)
  const maxTimecodeEnd = Math.max(...timings.map(t => t.endSec));
  const srcTotalFrames = Math.ceil(Math.max(videoDurationSec || 0, maxTimecodeEnd) * fps);

  // ── 시퀀스 마커 (장면 경계 — Shift+M으로 즉시 네비게이션) ──
  const markers = timings.map((t, i) => {
    const s = scenes[i];
    const mTag = s.mode ? `[${s.mode.replace(/[\[\]]/g, '')}] ` : '';
    const markerName = `${mTag}#${i + 1} ${(s.audioContent || s.dialogue || '').slice(0, 50)}`;
    const markerComment = [s.effectSub, s.videoDirection]
      .filter(Boolean).join(' | ').slice(0, 200);
    return `
    <marker>
      <name>${escXml(markerName)}</name>
      <comment>${escXml(markerComment)}</comment>
      <in>${toFrames(t.tlStartSec)}</in>
      <out>-1</out>
    </marker>`;
  }).join('');

  // ── V1 비디오 클립 (링크 + 메타데이터 + 라벨) ──
  const videoClips = timings.map((t, i) => {
    const s = scenes[i];
    const color = modeToLabelColor(s.mode);
    // [FIX #316] 클립 이름에 모드+오디오 내용 표시 — Premiere 타임라인에서 즉시 확인 가능
    const modeTag = s.mode ? `${s.mode.replace(/[\[\]]/g, '')}` : '';
    const clipName = `${modeTag ? `[${modeTag}] ` : ''}#${i + 1} ${(s.audioContent || s.dialogue || s.sceneDesc || '').slice(0, 50)}`;
    const fileTag = i === 0
      ? `<file id="file-1">
              <name>${safeFileName}</name>
              <pathurl>media/${escXml(videoFileName)}</pathurl>
              <duration>${srcTotalFrames}</duration>
              <rate><ntsc>${ntscStr}</ntsc><timebase>${timebase}</timebase></rate>
              <media>
                <video><samplecharacteristics><width>${width}</width><height>${height}</height><anamorphic>FALSE</anamorphic><pixelaspectratio>square</pixelaspectratio><fielddominance>none</fielddominance></samplecharacteristics></video>
                <audio><channelcount>2</channelcount><samplecharacteristics><samplerate>48000</samplerate><depth>16</depth></samplecharacteristics></audio>
              </media>
            </file>`
      : '<file id="file-1"/>';
    return `
          <clipitem id="clip-${i + 1}" premiereChannelType="stereo">
            <masterclipid>masterclip-1</masterclipid>
            <name>${escXml(clipName)}</name>
            <duration>${srcTotalFrames}</duration>
            <rate><ntsc>${ntscStr}</ntsc><timebase>${timebase}</timebase></rate>
            <in>${toFrames(t.startSec)}</in>
            <out>${toFrames(t.endSec)}</out>
            <start>${toFrames(t.tlStartSec)}</start>
            <end>${toFrames(t.tlEndSec)}</end>
            ${fileTag}${nsTimings[i]?.autoSpeedFactor != null && nsTimings[i].autoSpeedFactor < 0.999 ? `
            <filter>
              <effect>
                <name>Time Remap</name>
                <effectid>timeremap</effectid>
                <effecttype>motion</effecttype>
                <mediatype>video</mediatype>
                <parameter><parameterid>speed</parameterid><value>${Math.round(nsTimings[i].autoSpeedFactor * 100)}</value></parameter>
                <parameter><parameterid>frameblending</parameterid><value>TRUE</value></parameter>
              </effect>
            </filter>` : ''}
            <sourcetrack>
              <mediatype>video</mediatype>
              <trackindex>1</trackindex>
            </sourcetrack>
            <labels><label2>${color}</label2></labels>
            <logginginfo>
              <description>${escXml(s.sceneDesc || '')}</description>
              <scene>${escXml(String(i + 1))}</scene>
              <shottake>${escXml(s.videoDirection || '')}</shottake>
              <lognote>${escXml(t.text)}</lognote>
            </logginginfo>
            <comments>
              <mastercomment1>${escXml([s.dialogue, s.effectSub].filter(Boolean).join(' / '))}</mastercomment1>
            </comments>
            <link>
              <linkclipref>clip-${i + 1}</linkclipref>
              <mediatype>video</mediatype>
              <trackindex>1</trackindex>
              <clipindex>${i + 1}</clipindex>
            </link>
            <link>
              <linkclipref>audio-${i + 1}</linkclipref>
              <mediatype>audio</mediatype>
              <trackindex>1</trackindex>
              <clipindex>${i + 1}</clipindex>
            </link>
          </clipitem>`;
  }).join('');

  // ── V2 일반자막 트랙 (Subtitle — 숏츠 60pt/12자 줄바꿈) ──
  const isShorts = !hasLandscapeAspect(width, height);
  const dialogueFontSize = isShorts ? 60 : 42;
  const subtitleClips = timings.filter(t => t.text).map((t, i) => {
    const displayText = isShorts ? breakDialogueLines(t.text, 12) : breakLines(t.text);
    return `
          <generatoritem id="sub-${i + 1}">
            <name>${escXml(displayText.replace(/\n/g, ' ').slice(0, 40))}</name>
            <duration>${toFrames(t.durationSec)}</duration>
            <rate><ntsc>${ntscStr}</ntsc><timebase>${timebase}</timebase></rate>
            <in>0</in>
            <out>${toFrames(t.durationSec)}</out>
            <start>${toFrames(t.tlStartSec)}</start>
            <end>${toFrames(t.tlEndSec)}</end>
            <enabled>TRUE</enabled>
            <anamorphic>FALSE</anamorphic>
            <alphatype>black</alphatype>
            <effect>
              <name>Text</name>
              <effectid>Text</effectid>
              <effectcategory>Text</effectcategory>
              <effecttype>generator</effecttype>
              <mediatype>video</mediatype>
              <parameter><parameterid>str</parameterid><name>Text</name><value>${escXml(displayText)}</value></parameter>
              <parameter><parameterid>fontsize</parameterid><name>Font Size</name><value>${dialogueFontSize}</value></parameter>
              <parameter><parameterid>fontstyle</parameterid><name>Font Style</name><value>1</value></parameter>
              <parameter><parameterid>fontcolor</parameterid><name>Font Color</name><value>16777215</value></parameter>
              <parameter><parameterid>origin</parameterid><name>Origin</name><value>${subtitleOrigin.main}</value></parameter>
            </effect>
          </generatoritem>`;
  }).join('');

  // ── V3 효과자막 트랙 ──
  const effectSubClips = timings.filter(t => t.effectText).map((t, i) => `
          <generatoritem id="fx-${i + 1}">
            <name>${escXml(t.effectText.slice(0, 40))}</name>
            <duration>${toFrames(t.durationSec)}</duration>
            <rate><ntsc>${ntscStr}</ntsc><timebase>${timebase}</timebase></rate>
            <in>0</in>
            <out>${toFrames(t.durationSec)}</out>
            <start>${toFrames(t.tlStartSec)}</start>
            <end>${toFrames(t.tlEndSec)}</end>
            <enabled>TRUE</enabled>
            <anamorphic>FALSE</anamorphic>
            <effect>
              <name>Text</name>
              <effectid>Text</effectid>
              <effectcategory>Text</effectcategory>
              <effecttype>generator</effecttype>
              <mediatype>video</mediatype>
              <parameter><parameterid>str</parameterid><name>Text</name><value>${escXml(t.effectText)}</value></parameter>
              <parameter><parameterid>fontsize</parameterid><name>Font Size</name><value>60</value></parameter>
              <parameter><parameterid>fontstyle</parameterid><name>Font Style</name><value>4</value></parameter>
              <parameter><parameterid>fontcolor</parameterid><name>Font Color</name><value>16776960</value></parameter>
              <parameter><parameterid>origin</parameterid><name>Origin</name><value>${subtitleOrigin.effect}</value></parameter>
            </effect>
          </generatoritem>`).join('');

  // ── A1 오디오 클립 (링크 + 라벨) ──
  const audioClips = timings.map((t, i) => {
    const s = scenes[i];
    const color = modeToLabelColor(s.mode);
    return `
          <clipitem id="audio-${i + 1}">
            <masterclipid>masterclip-1</masterclipid>
            <name>${escXml(`Scene ${String(i + 1).padStart(3, '0')} Audio`)}</name>
            <duration>${srcTotalFrames}</duration>
            <rate><ntsc>${ntscStr}</ntsc><timebase>${timebase}</timebase></rate>
            <in>${toFrames(t.startSec)}</in>
            <out>${toFrames(t.endSec)}</out>
            <start>${toFrames(t.tlStartSec)}</start>
            <end>${toFrames(t.tlEndSec)}</end>
            <file id="file-1"/>
            <sourcetrack>
              <mediatype>audio</mediatype>
              <trackindex>1</trackindex>
            </sourcetrack>
            <labels><label2>${color}</label2></labels>
            <link>
              <linkclipref>clip-${i + 1}</linkclipref>
              <mediatype>video</mediatype>
              <trackindex>1</trackindex>
              <clipindex>${i + 1}</clipindex>
            </link>
            <link>
              <linkclipref>audio-${i + 1}</linkclipref>
              <mediatype>audio</mediatype>
              <trackindex>1</trackindex>
              <clipindex>${i + 1}</clipindex>
            </link>
          </clipitem>`;
  }).join('');

  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE xmeml>
<xmeml version="5">
  <sequence>
    <name>${safeTitle}</name>
    <duration>${totalFrames}</duration>
    <rate>
      <ntsc>${ntscStr}</ntsc>
      <timebase>${timebase}</timebase>
    </rate>
    <timecode>
      <rate><ntsc>${ntscStr}</ntsc><timebase>${timebase}</timebase></rate>
      <string>${secondsToFcpTc(0, fps)}</string>
      <frame>0</frame>
      <displayformat>${tcFormat}</displayformat>
    </timecode>${markers}
    <media>
      <video>
        <format>
          <samplecharacteristics>
            <width>${width}</width>
            <height>${height}</height>
            <anamorphic>FALSE</anamorphic>
            <pixelaspectratio>square</pixelaspectratio>
            <fielddominance>none</fielddominance>
            <rate><ntsc>${ntscStr}</ntsc><timebase>${timebase}</timebase></rate>
            <colordepth>24</colordepth>
            <codec>
              <name>Apple ProRes 422</name>
            </codec>
          </samplecharacteristics>
        </format>
        <track>${videoClips}
        </track>${subtitleClips ? `
        <track>
          <enabled>TRUE</enabled>${subtitleClips}
        </track>` : ''}${effectSubClips ? `
        <track>
          <enabled>TRUE</enabled>${effectSubClips}
        </track>` : ''}
      </video>
      <audio>
        <numOutputChannels>2</numOutputChannels>
        <format>
          <samplecharacteristics>
            <samplerate>48000</samplerate>
            <depth>16</depth>
          </samplecharacteristics>
        </format>
        <outputs>
          <group>
            <index>1</index>
            <numchannels>2</numchannels>
            <downmix>0</downmix>
            <channel><index>1</index></channel>
            <channel><index>2</index></channel>
          </group>
        </outputs>
        <track>
          <outputchannelindex>1</outputchannelindex>${audioClips}
        </track>${(() => {
    const narClips = narrationLines.filter(l => l.audioFileName);
    if (narClips.length === 0) return '';
    return `
        <track>
          <outputchannelindex>1</outputchannelindex>${narClips.map((line, i) => {
      const startSec = line.startTime ?? nsTimings[i]?.timelineStartSec ?? 0;
      const durationSec = Math.max(0.1, line.duration ?? nsTimings[i]?.targetDurationSec ?? 3);
      const durFrames = toFrames(durationSec);
      const startFrames = toFrames(startSec);
      return `
          <clipitem id="narration-${i + 1}" premiereChannelType="stereo">
            <name>${escXml(`Narration ${String(i + 1).padStart(3, '0')}`)}</name>
            <duration>${durFrames}</duration>
            <rate><ntsc>${ntscStr}</ntsc><timebase>${timebase}</timebase></rate>
            <in>0</in><out>${durFrames}</out>
            <start>${startFrames}</start><end>${startFrames + durFrames}</end>
            <file id="narfile-${i + 1}">
              <name>${escXml(line.audioFileName!)}</name>
              <pathurl>${escXml(`audio/${line.audioFileName!}`)}</pathurl>
              <duration>${durFrames}</duration>
              <rate><ntsc>${ntscStr}</ntsc><timebase>${timebase}</timebase></rate>
              <media><audio><channelcount>2</channelcount><samplecharacteristics><samplerate>48000</samplerate><depth>16</depth></samplecharacteristics></audio></media>
            </file>
            <sourcetrack><mediatype>audio</mediatype><trackindex>1</trackindex></sourcetrack>
            <labels><label2>Caribbean</label2></labels>
          </clipitem>`;
    }).join('')}
        </track>`;
  })()}
      </audio>
    </media>
  </sequence>
</xmeml>`;
}

// ──────────────────────────────────────────────
// CapCut 프로젝트 (draft_content.json)
// ──────────────────────────────────────────────

export function generateCapCutDraftJson(params: {
  scenes: VideoSceneRow[];
  title: string;
  videoFileName: string;
  fps?: number;
  width?: number;
  height?: number;
  preset?: VideoAnalysisPreset;
  videoDurationSec?: number;
  narrationLines?: ExportNarrationLine[];
}): {
  json: string;
  keyValueJson: string;
  scaffoldIds: CapCutProjectScaffoldIds;
  trackIds: string[];
} {
  const { scenes, title, videoFileName: rawVideoFileName, fps = 30, width = 1080, height = 1920, preset, videoDurationSec, narrationLines = [] } = params;
  const videoFileName = sanitizeFileName(rawVideoFileName);
  const syncTimeline = buildNarrationSyncedTimeline(scenes, narrationLines, preset);
  const nsTimings = syncTimeline.scenes;
  const timings: SceneTiming[] = nsTimings.map(t => ({
    index: t.sceneIndex,
    startSec: t.sourceStartSec + t.trimStartSec,
    endSec: t.sourceStartSec + t.trimEndSec,
    durationSec: t.targetDurationSec,
    tlStartSec: t.timelineStartSec,
    tlEndSec: t.timelineEndSec,
    text: t.subtitleSegments.map(s => s.text).join(' '),
    effectText: t.effectSubtitleSegments.map(s => s.text).join(' '),
  }));
  if (timings.length === 0) {
    return {
      json: '',
      keyValueJson: '{}',
      scaffoldIds: {
        draftFolderId: '',
        draftId: '',
        timelineId: '',
        timelineProjectId: '',
      },
      trackIds: [],
    };
  }

  const totalDurUs = toUs(syncTimeline.totalDurationSec);
  const maxEnd = Math.max(...nsTimings.map(t => t.sourceEndSec));
  const srcDurUs = toUs(Math.max(videoDurationSec || 0, maxEnd));

  const platform = detectCapCutDesktopPlatform();
  const scaffoldIds: CapCutProjectScaffoldIds = {
    draftFolderId: uuid(),
    draftId: uuid(),
    timelineId: uuid(),
    timelineProjectId: uuid(),
  };
  const materialVideoId = uuid();
  const speedId = uuid();
  const canvasId = uuid();
  const trackVideoId = uuid();
  const platformInfo = buildCapCutPlatformInfo(platform);

  // 빈 배열 필드 (캡컷 필수 구조)
  const emptyArr: never[] = [];

  // ── 비디오 세그먼트 (편집점 = 실제 컷) ──
  const videoSegments = timings.map(t => buildCapCutSegmentShell({
    clip: {
      alpha: 1.0,
      flip: { horizontal: false, vertical: false },
      rotation: 0.0,
      scale: { x: 1.0, y: 1.0 },
      transform: { x: 0.0, y: 0.0 },
    },
    commonKeyframes: emptyArr,
    enableAdjust: true,
    extraMaterialRefs: [speedId, canvasId],
    materialId: materialVideoId,
    renderIndex: 0,
    sourceDurationUs: toUs(t.durationSec),
    sourceStartUs: toUs(t.startSec),
    speed: nsTimings[timings.indexOf(t)]?.autoSpeedFactor ?? 1.0,
    targetDurationUs: toUs(t.durationSec),
    targetStartUs: toUs(t.tlStartSec),
    trackRenderIndex: 0,
  }));

  // ── 텍스트 자막 머티리얼 + 세그먼트 (CapCut 네이티브 자막) ──
  const textMaterials = timings.filter(t => t.text).map(t => {
    const tid = uuid();
    return { id: tid, text: t.text, effectText: t.effectText, tlStartSec: t.tlStartSec, durationSec: t.durationSec };
  });
  const fxMaterials = timings.filter(t => t.effectText).map(t => {
    const tid = uuid();
    return { id: tid, text: t.effectText, tlStartSec: t.tlStartSec, durationSec: t.durationSec };
  });

  const textObjects = textMaterials.map(m => ({
    add_type: 0,
    alignment: 1,
    background_alpha: 0.0,
    background_color: '',
    background_height: 0.14,
    background_horizontal_offset: 0.0,
    background_round_radius: 0.0,
    background_style: 0,
    background_vertical_offset: 0.004,
    background_width: 0.14,
    bold_width: 0.0,
    border_alpha: 1.0,
    border_color: '',
    border_width: 0.08,
    check_flag: 7,
    content: JSON.stringify({ styles: [{ range: [0, m.text.length], size: 8.0, bold: true, italic: false, color: [1.0, 1.0, 1.0], useLetterColor: true }], text: m.text }),
    fixed_height: -1.0,
    fixed_width: -1.0,
    font_category_id: '',
    font_category_name: '',
    font_id: '',
    font_name: '',
    font_path: '',
    font_resource_id: '',
    font_size: 8.0,
    font_source_platform: 0,
    font_team_id: '',
    font_title: 'default',
    font_url: '',
    fonts: [],
    force_apply_line_max_width: false,
    global_alpha: 1.0,
    has_shadow: false,
    id: m.id,
    initial_scale: 1.0,
    inner_padding: -1.0,
    is_rich_text: false,
    italic_degree: 0,
    ktv_color: '',
    language: '',
    layer_weight: 1,
    letter_spacing: 0.0,
    line_feed: 1,
    line_max_width: 0.82,
    line_spacing: 0.02,
    multi_language_current: 'none',
    name: '',
    original_size: [],
    preset_category: '',
    preset_category_id: '',
    preset_has_set_alignment: false,
    preset_id: '',
    preset_index: 0,
    preset_name: '',
    recognize_task_id: '',
    recognize_type: 0,
    relevance_segment: [],
    shadow_alpha: 0.9,
    shadow_angle: -45.0,
    shadow_color: '',
    shadow_distance: 0.04,
    shadow_point: { x: 0.6363961031, y: -0.6363961031 },
    shadow_smoothing: 0.45,
    shape_clip_x: false,
    shape_clip_y: false,
    style_name: '',
    sub_type: 0,
    subtitle_keywords: null,
    subtitle_template_original_fontsize: 0.0,
    text_alpha: 1.0,
    text_color: '#FFFFFF',
    text_curve: null,
    text_preset_resource_id: '',
    text_size: 30,
    text_to_audio_ids: [],
    tts_auto_update: false,
    type: 'subtitle',
    typesetting: 0,
    underline: false,
    underline_offset: 0.22,
    underline_width: 0.05,
    use_effect_default_color: true,
    words: null,
  }));

  const textSegments = textMaterials.map(m => buildCapCutSegmentShell({
    clip: { alpha: 1.0, flip: { horizontal: false, vertical: false }, rotation: 0.0, scale: { x: 1.0, y: 1.0 }, transform: { x: 0.0, y: 0.0 } },
    commonKeyframes: emptyArr,
    enableAdjust: false,
    extraMaterialRefs: emptyArr,
    materialId: m.id,
    renderIndex: 11000,
    sourceDurationUs: toUs(m.durationSec),
    sourceStartUs: 0,
    speed: 1.0,
    targetDurationUs: toUs(m.durationSec),
    targetStartUs: toUs(m.tlStartSec),
    trackRenderIndex: 11000,
  }));

  // [FIX #575] 효과 자막 머티리얼 + 세그먼트 — 기존 fxMaterials가 미사용이었음
  const fxTextObjects = fxMaterials.map(m => ({
    add_type: 0, alignment: 1, background_alpha: 0.0, background_color: '', background_height: 0.14,
    background_horizontal_offset: 0.0, background_round_radius: 0.0, background_style: 0,
    background_vertical_offset: 0.004, background_width: 0.14, bold_width: 0.0, border_alpha: 1.0,
    border_color: '#000000', border_width: 0.08, check_flag: 7,
    content: JSON.stringify({ styles: [{ range: [0, m.text.length], size: 6.0, bold: true, italic: true, color: [1.0, 1.0, 0.0], useLetterColor: true }], text: m.text }),
    fixed_height: -1.0, fixed_width: -1.0, font_category_id: '', font_category_name: '', font_id: '',
    font_name: '', font_path: '', font_resource_id: '', font_size: 6.0, font_source_platform: 0,
    font_team_id: '', font_title: 'default', font_url: '', fonts: [],
    force_apply_line_max_width: false, global_alpha: 1.0, has_shadow: false, id: m.id,
    initial_scale: 1.0, inner_padding: -1.0, is_rich_text: false, italic_degree: 0,
    ktv_color: '', language: '', layer_weight: 1, letter_spacing: 0.0, line_feed: 1,
    line_max_width: 0.82, line_spacing: 0.02, multi_language_current: 'none', name: '',
    original_size: [], preset_category: '', preset_category_id: '', preset_has_set_alignment: false,
    preset_id: '', preset_index: 0, preset_name: '', recognize_task_id: '', recognize_type: 0,
    relevance_segment: [], shadow_alpha: 0.9, shadow_angle: -45.0, shadow_color: '',
    shadow_distance: 0.04, shadow_point: { x: 0.6363961031, y: -0.6363961031 },
    shadow_smoothing: 0.45, shape_clip_x: false, shape_clip_y: false, style_name: '',
    sub_type: 0, subtitle_keywords: null, subtitle_template_original_fontsize: 0.0,
    text_alpha: 1.0, text_color: '#FFFF00', text_curve: null, text_preset_resource_id: '',
    text_size: 24, text_to_audio_ids: [], tts_auto_update: false, type: 'subtitle',
    typesetting: 0, underline: false, underline_offset: 0.22, underline_width: 0.05,
    use_effect_default_color: true, words: null,
  }));
  const fxTextSegments = fxMaterials.map(m => buildCapCutSegmentShell({
    clip: { alpha: 1.0, flip: { horizontal: false, vertical: false }, rotation: 0.0, scale: { x: 1.0, y: 1.0 }, transform: { x: 0.0, y: 0.25 } },
    commonKeyframes: emptyArr,
    enableAdjust: false,
    extraMaterialRefs: emptyArr,
    materialId: m.id,
    renderIndex: 12000,
    sourceDurationUs: toUs(m.durationSec),
    sourceStartUs: 0,
    speed: 1.0,
    targetDurationUs: toUs(m.durationSec),
    targetStartUs: toUs(m.tlStartSec),
    trackRenderIndex: 12000,
  }));

  const audioMaterialsWithStart = narrationLines.flatMap((line, lineIndex) => {
    const audioFileName = line.audioFileName ? sanitizeFileName(line.audioFileName) : '';
    if (!audioFileName) return [];

    const syncedTiming = nsTimings[lineIndex];
    const startSec = typeof line.startTime === 'number' && Number.isFinite(line.startTime)
      ? line.startTime
      : syncedTiming?.timelineStartSec;
    const durationSec = typeof line.duration === 'number' && Number.isFinite(line.duration)
      ? line.duration
      : syncedTiming?.targetDurationSec;

    if (startSec == null || durationSec == null) return [];

    return [{
      id: uuid(),
      fileName: audioFileName,
      dur: toUs(Math.max(0.1, durationSec)),
      start: toUs(Math.max(0, startSec)),
    }];
  });
  const audioMaterials = audioMaterialsWithStart.map(({ id, fileName, dur }) => ({ id, fileName, dur }));
  const audioSegments = audioMaterialsWithStart.map((audioMaterial) => buildCapCutSegmentShell({
    clip: { alpha: 1.0, flip: { horizontal: false, vertical: false }, rotation: 0.0, scale: { x: 1.0, y: 1.0 }, transform: { x: 0.0, y: 0.0 } },
    commonKeyframes: emptyArr,
    enableAdjust: false,
    extraMaterialRefs: emptyArr,
    materialId: audioMaterial.id,
    renderIndex: 0,
    sourceDurationUs: audioMaterial.dur,
    sourceStartUs: 0,
    speed: 1.0,
    targetDurationUs: audioMaterial.dur,
    targetStartUs: audioMaterial.start,
    trackRenderIndex: 0,
  }));

  const trackTextId = uuid();
  const trackAudioId = uuid();
  const trackFxTextId = uuid();
  const keyValueEntries = [
    ...videoSegments.map((segment) => ({
      segmentId: String(segment['id'] || ''),
      materialName: videoFileName,
    })),
    ...audioSegments.map((segment, index) => ({
      segmentId: String(segment['id'] || ''),
      materialName: audioMaterials[index]?.fileName || '',
    })).filter((entry) => entry.materialName),
  ];

  const draft = {
    canvas_config: {
      background: '',
      height,
      ratio: 'original',
      width,
    },
    color_space: 0,
    config: {
      adjust_max_index: 1,
      attachment_info: emptyArr,
      combination_max_index: 1,
      export_range: null,
      extract_audio_last_index: 1,
      lyrics_recognition_id: '',
      lyrics_sync: false,
      lyrics_taskinfo: emptyArr,
      maintrack_adsorb: true,
      material_save_mode: 0,
      original_sound_last_index: 1,
      record_audio_last_index: 1,
      sticker_max_index: 1,
      subtitle_keywords_config: null,
      subtitle_recognition_id: '',
      subtitle_sync: false,
      subtitle_taskinfo: emptyArr,
      system_font_list: emptyArr,
      video_mute: false,
      zoom_info_params: null,
    },
    cover: null,
    create_time: 0,
    draft_type: 'video',
    duration: totalDurUs,
    extra_info: null,
    function_assistant_info: {
      audio_noise_segid_list: emptyArr,
      auto_adjust: false,
      auto_adjust_fixed: false,
      auto_adjust_fixed_value: 0,
      auto_adjust_segid_list: emptyArr,
      auto_caption: false,
      auto_caption_segid_list: emptyArr,
      auto_caption_template_id: '',
      auto_lyrics: false,
      auto_lyrics_segid_list: emptyArr,
      auto_music: false,
      auto_music_segid_list: emptyArr,
      auto_speed: false,
      auto_speed_conf: '',
      auto_subtitle: false,
      auto_subtitle_segid_list: emptyArr,
      auto_video_beauty: false,
      auto_video_beauty_segid_list: emptyArr,
      beautify_body: false,
      beautify_face: false,
      enable_ai: false,
      remove_background: false,
      video_mosaic: false,
    },
    fps: fps,
    free_render_index_mode_on: false,
    group_container: null,
    id: scaffoldIds.timelineId,
    is_drop_frame_timecode: false,
    keyframe_graph_list: emptyArr,
    keyframes: { adjusts: emptyArr, audios: emptyArr, effects: emptyArr, filters: emptyArr, handwrites: emptyArr, stickers: emptyArr, texts: emptyArr, videos: emptyArr },
    last_modified_platform: platformInfo,
    lyrics_effects: emptyArr,
    materials: {
      ...buildCapCutEmptyMaterialBuckets(),
      audios: audioMaterials.map((material) => ({
        ai_music_enter_from: '',
        ai_music_generate_scene: 0,
        ai_music_type: 0,
        aigc_history_id: '',
        aigc_item_id: '',
        app_id: 0,
        category_id: '',
        category_name: 'local',
        check_flag: 1,
        cloned_model_type: '',
        copyright_limit_type: 'none',
        duration: material.dur,
        effect_id: '',
        formula_id: '',
        id: material.id,
        intensifies_path: '',
        is_ai_clone_tone: false,
        is_ai_clone_tone_post: false,
        is_text_edit_overdub: false,
        is_ugc: false,
        local_material_id: '',
        lyric_type: 0,
        mock_tone_speaker: '',
        moyin_emotion: '',
        music_id: '',
        name: material.fileName,
        path: buildCapCutContainedMaterialPath(scaffoldIds.draftFolderId, 'audio', material.fileName),
        pgc_id: '',
        pgc_name: '',
        query: '',
        request_id: '',
        resource_id: '',
        search_id: '',
        similiar_music_info: { original_song_id: '', original_song_name: '' },
        sound_separate_type: '',
        source_from: '',
        source_platform: 0,
        team_id: '',
        text_id: '',
        third_resource_id: '',
        tone_category_id: '',
        tone_category_name: '',
        tone_effect_id: '',
        tone_effect_name: '',
        tone_emotion_name_key: '',
        tone_emotion_role: '',
        tone_emotion_scale: 0.0,
        tone_emotion_selection: '',
        tone_emotion_style: '',
        tone_platform: '',
        tone_second_category_id: '',
        tone_second_category_name: '',
        tone_speaker: '',
        tone_type: '',
        tts_benefit_info: { benefit_amount: -1, benefit_log_extra: '', benefit_log_id: '', benefit_type: 'none' },
        tts_generate_scene: '',
        tts_task_id: '',
        type: 'extract_music',
        unique_id: '',
        video_id: '',
        wave_points: [],
      })),
      canvases: [buildCapCutCanvasMaterial(canvasId)],
      material_animations: [buildCapCutMaterialAnimation(uuid())],
      speeds: [{
        curve_speed: null,
        id: speedId,
        mode: 0,
        name: '',
        speed: 1.0,
        type: 'speed',
      }],
      stickers: emptyArr,
      tail_animations: emptyArr,
      text_templates: emptyArr,
      texts: [...textObjects, ...fxTextObjects],
      transitions: emptyArr,
      video_effects: emptyArr,
      video_trackings: emptyArr,
      videos: [{
        aigc_history_id: '',
        aigc_item_id: '',
        aigc_type: 'none',
        audio_fade: null,
        beauty_body_auto_preset: null,
        beauty_body_preset_id: '',
        beauty_face_auto_preset: { name: '', preset_id: '', rate_map: '', scene: '' },
        beauty_face_auto_preset_infos: [],
        beauty_face_preset_infos: [],
        cartoon_path: '',
        category_id: '',
        category_name: '',
        check_flag: 62978047,
        content_feature_info: null,
        corner_pin: null,
        crop: {
          lower_left_x: 0.0, lower_left_y: 1.0,
          lower_right_x: 1.0, lower_right_y: 1.0,
          upper_left_x: 0.0, upper_left_y: 0.0,
          upper_right_x: 1.0, upper_right_y: 0.0,
        },
        crop_ratio: 'free',
        crop_scale: 1.0,
        duration: srcDurUs,
        extra_type_option: 0,
        formula_id: '',
        freeze: null,
        has_audio: true,
        has_sound_separated: false,
        height,
        id: materialVideoId,
        intensifies_audio_path: '',
        intensifies_path: '',
        is_ai_generate_content: false,
        is_copyright: false,
        is_text_edit_overdub: false,
        is_unified_beauty_mode: false,
        live_photo_cover_path: '',
        live_photo_timestamp: -1,
        local_id: '',
        local_material_from: '',
        local_material_id: '',
        material_id: '',
        material_name: videoFileName,
        material_url: '',
        matting: {
          custom_matting_id: '',
          enable_matting_stroke: false,
          expansion: 0,
          feather: 0,
          flag: 0,
          has_use_quick_brush: false,
          has_use_quick_eraser: false,
          interactiveTime: [],
          path: '',
          reverse: false,
          strokes: [],
        },
        media_path: '',
        music_id: '',
        multi_camera_info: null,
        object_locked: null,
        origin_material_id: '',
        path: buildCapCutContainedMaterialPath(scaffoldIds.draftFolderId, 'video', videoFileName),
        picture_from: 'none',
        picture_set_category_id: '',
        picture_set_category_name: '',
        request_id: '',
        reverse_intensifies_path: '',
        reverse_path: '',
        smart_match_info: null,
        smart_motion: null,
        stable: {
          matrix_path: '',
          stable_level: 0,
          time_range: { duration: 0, start: 0 },
        },
        source: 0,
        source_platform: 0,
        surface_trackings: [],
        team_id: '',
        type: 'video',
        unique_id: '',
        video_algorithm: {
          ai_background_configs: [],
          ai_expression_driven: null,
          ai_in_painting_config: [],
          ai_motion_driven: null,
          aigc_generate: null,
          aigc_generate_list: [],
          algorithms: [],
          complement_frame_config: null,
          deflicker: null,
          gameplay_configs: [],
          image_interpretation: null,
          motion_blur_config: null,
          mouth_shape_driver: null,
          noise_reduction: null,
          path: '',
          quality_enhance: null,
          skip_algorithm_index: [],
          smart_complement_frame: null,
          story_video_modify_video_config: { is_overwrite_last_video: false, task_id: '', tracker_task_id: '' },
          super_resolution: null,
          time_range: { duration: 0, start: 0 },
        },
        video_mask_shadow: { alpha: 0.0, angle: 0.0, blur: 0.0, color: '', distance: 0.0, path: '', resource_id: '' },
        video_mask_stroke: {
          alpha: 0.0,
          color: '',
          distance: 0.0,
          horizontal_shift: 0.0,
          path: '',
          resource_id: '',
          size: 0.0,
          texture: 0.0,
          type: '',
          vertical_shift: 0.0,
        },
        width,
      }],
    },
    mutable_config: null,
    name: '',
    new_version: '163.0.0',
    path: '',
    platform: platformInfo,
    relationships: emptyArr,
    render_index_track_mode_on: true,
    retouch_cover: null,
    smart_ads_info: { draft_url: '', page_from: '', routine: '' },
    source: 'default',
    static_cover_image_path: '',
    time_marks: null,
    tracks: [{
      attribute: 0,
      flag: 0,
      id: trackVideoId,
      is_default_name: true,
      name: '',
      segments: videoSegments,
      type: 'video',
    }, ...(textSegments.length > 0 ? [{
      attribute: 0,
      flag: 0,
      id: trackTextId,
      is_default_name: true,
      name: '',
      segments: textSegments,
      type: 'text',
    }] : []), ...(audioSegments.length > 0 ? [{
      attribute: 0,
      flag: 0,
      id: trackAudioId,
      is_default_name: true,
      name: '',
      segments: audioSegments,
      type: 'audio',
    }] : []), ...(fxTextSegments.length > 0 ? [{
      attribute: 0,
      flag: 0,
      id: trackFxTextId,
      is_default_name: true,
      name: '',
      segments: fxTextSegments,
      type: 'text',
    }] : [])],
    uneven_animation_template_info: { composition: '', content: '', order: '', sub_template_info_list: emptyArr },
    update_time: 0,
    version: 360000,
  };

  return {
    json: JSON.stringify(draft),
    keyValueJson: buildCapCutKeyValue(keyValueEntries),
    scaffoldIds,
    trackIds: [trackVideoId, ...(textSegments.length > 0 ? [trackTextId] : []), ...(audioSegments.length > 0 ? [trackAudioId] : []), ...(fxTextSegments.length > 0 ? [trackFxTextId] : [])],
  };
}

// ──────────────────────────────────────────────
// SRT 생성 (NLE 패키지용)
// ──────────────────────────────────────────────

export function generateNleSrt(
  scenes: VideoSceneRow[],
  layer: 'dialogue' | 'effect' | 'narration' = 'dialogue',
  preset?: VideoAnalysisPreset,
  timingMode: 'timeline' | 'source' = 'timeline',
  narrationLines: ExportNarrationLine[] = [],
): string {
  const syncTimeline = buildNarrationSyncedTimeline(scenes, narrationLines, preset);
  const nsTimings = syncTimeline.scenes;
  let idx = 1;
  const entries: string[] = [];

  for (const t of nsTimings) {
    const segments = layer === 'effect' ? t.effectSubtitleSegments : t.subtitleSegments;
    for (const seg of segments) {
      if (!seg.text.trim()) continue;
      const srtStart = timingMode === 'timeline' ? seg.startTime : t.sourceStartSec + t.trimStartSec;
      const srtEnd = timingMode === 'timeline' ? seg.endTime : t.sourceStartSec + t.trimEndSec;
      const lineText = (layer === 'dialogue' || layer === 'narration')
        ? breakDialogueLines(seg.text, 12)
        : breakLines(seg.text);
      entries.push(`${idx}\n${secondsToSrtTime(srtStart)} --> ${secondsToSrtTime(srtEnd)}\n${lineText}`);
      idx++;
    }
  }

  return entries.join('\n\n');
}

// ──────────────────────────────────────────────
// ZIP 패키지 빌더
// ──────────────────────────────────────────────

export type NleTarget = 'premiere' | 'capcut' | 'vrew';

export async function buildNlePackageZip(params: {
  target: NleTarget;
  scenes: VideoSceneRow[];
  title: string;
  videoBlob: Blob | null;
  videoFileName: string;
  preset?: VideoAnalysisPreset;
  width?: number;
  height?: number;
  fps?: number;
  videoDurationSec?: number;
  narrationLines?: ExportNarrationLine[];
}): Promise<Blob> {
  const { target, scenes, title, videoBlob, videoFileName: rawVideoFileName, preset, width, height, fps, videoDurationSec, narrationLines = [] } = params;
  const sanitizedVideoFileName = sanitizeFileName(rawVideoFileName || 'video.mp4');
  const videoFileName = /\.[a-zA-Z0-9]{2,5}$/.test(sanitizedVideoFileName) ? sanitizedVideoFileName : `${sanitizedVideoFileName || 'video'}.mp4`;
  const hasValidVideoBlob = !!videoBlob && videoBlob.size > 0;
  const JSZip = (await import('jszip')).default;
  const zip = new JSZip();
  const safeName = sanitizeProjectName(title);
  const BOM = '\uFEFF';
  const packagedNarrationBlobs: Array<{ fileName: string; blob: Blob }> = [];

  if (!hasValidVideoBlob) {
    throw new Error('원본 영상 파일을 찾을 수 없어 NLE 패키지를 만들 수 없습니다. 원본 영상을 다시 불러온 뒤 시도해주세요.');
  }

  // 나레이션 오디오 패키징 — audioUrl → blob → ZIP에 추가 + audioFileName 설정
  const packagedNarrationLines: ExportNarrationLine[] = [];
  for (let i = 0; i < narrationLines.length; i++) {
    const line = narrationLines[i];
    if (!line.audioUrl) { packagedNarrationLines.push(line); continue; }
    const blob = await fetchAssetBlob(line.audioUrl);
    if (!blob) { packagedNarrationLines.push(line); continue; }
    const fileName = `${String(i + 1).padStart(3, '0')}_narration.mp3`;
    const duration = line.duration ?? await measureBlobAudioDuration(blob) ?? 3;
    zip.file(`audio/${fileName}`, blob);
    packagedNarrationBlobs.push({ fileName, blob });
    packagedNarrationLines.push({ ...line, audioFileName: fileName, duration });
  }

  if (target === 'premiere') {
    // FCP XML
    const xml = generateFcpXml({ scenes, title, videoFileName, preset, width, height, fps, videoDurationSec, narrationLines: packagedNarrationLines });
    zip.file(`${safeName}.xml`, xml);

    // [FIX #328] 영상 파일을 media/ 하위폴더에 배치 — XML pathurl과 일치
    if (videoBlob) {
      zip.file(`media/${videoFileName || 'video.mp4'}`, videoBlob);
    }

    // [FIX #316] SRT를 sidecar 방식으로 media/ 폴더에 배치 — Premiere Captions 자동 인식
    // 영상 파일명과 동일한 이름.srt → Premiere가 자동으로 Captions 트랙에 로드
    const videoBase = (videoFileName || 'video.mp4').replace(/\.[^.]+$/, '');
    const dlgSrt = generateNleSrt(scenes, 'dialogue', preset, 'timeline', packagedNarrationLines);
    if (dlgSrt) zip.file(`media/${videoBase}.srt`, BOM + dlgSrt);

    const fxSrt = generateNleSrt(scenes, 'effect', preset, 'timeline', packagedNarrationLines);
    if (fxSrt) zip.file(`media/${videoBase}_효과.srt`, BOM + fxSrt);

    // 루트에도 SRT 복사 (수동 import 폴백용)
    if (dlgSrt) zip.file(`${safeName}_자막.srt`, BOM + dlgSrt);
    if (fxSrt) zip.file(`${safeName}_효과자막.srt`, BOM + fxSrt);

    const presetLabel: Record<string, string> = {
      tikitaka: '티키타카 리메이크', snack: '스낵 편집', condensed: '컨덴스드',
      deep: '딥 분석', shopping: '쇼핑 리뷰', alltts: 'All TTS',
    };
    zip.file('README.txt', [
      `=== ${title} — Premiere Pro / DaVinci Resolve ===`,
      '',
      '[ 가져오기 ]',
      '1. ZIP을 원하는 위치에 압축 해제하세요.',
      '2. Premiere Pro > File > Import (Ctrl+I)',
      `3. "${safeName}.xml" 선택 → 타임라인 자동 생성`,
      '4. media/ 폴더의 영상+자막이 자동 연결됩니다.',
      '',
      '[ 자막 (Captions) ]',
      `• media/${videoBase}.srt 가 영상과 같은 이름으로 배치되어 있습니다.`,
      '• Premiere에서 자동 인식되지 않을 경우:',
      '  File > Import > Captions > media/ 폴더의 .srt 선택',
      '• 자막 타임코드는 편집 타임라인 기준입니다.',
      '',
      '[ 타임라인 활용 ]',
      `• 마커(Marker): 장면마다 마커 설정됨 → Shift+M / Ctrl+Shift+M으로 이동`,
      '• 클립 색상: 파랑(나레이션) / 초록(대사) / 청록(원본나레이션) / 주황(액션)',
      '• 메타데이터: Window > Metadata 패널에서 장면 설명·대사 확인',
      '',
      '[ 프로젝트 정보 ]',
      `• 편집점: ${scenes.length}개`,
      `• 프리셋: ${presetLabel[preset || ''] || '기본'}`,
      `• 해상도: ${width}x${height} / ${fps}fps`,
    ].join('\n'));

  } else if (target === 'capcut') {
    // [FIX #610] CapCut — 프로젝트 폴더 구조 완전 호환
    // ZIP 내 모든 파일을 projectId 폴더 아래에 배치하여 CapCut이 미디어를 정확히 찾을 수 있게 함
    // 사용자는 이 폴더를 com.lveditor.draft/ 아래에 그대로 복사하면 됨

    // FCP XML (폴백 — ZIP 루트에 배치)
    const capCutXml = generateFcpXml({ scenes, title, videoFileName: videoFileName || 'video.mp4', preset, width, height, fps, videoDurationSec, narrationLines: packagedNarrationLines });
    zip.file(`${safeName}.xml`, capCutXml);

    // draft JSON (프로젝트 폴더 복사 방식)
    const draftResult = generateCapCutDraftJson({ scenes, title, videoFileName: videoFileName || 'video.mp4', preset, width, height, fps, videoDurationSec, narrationLines: packagedNarrationLines });
    const draftContent = JSON.parse(draftResult.json);
    const pId = draftResult.scaffoldIds.draftFolderId;
    const nowTs = Math.floor(Date.now() / 1000);
    const nowUs = Date.now() * 1000;
    const draftTotalDurUs = draftContent.duration || Math.ceil((extractTimings(scenes, preset).at(-1)?.tlEndSec || 0) * 1_000_000);
    const draftTimelineMaterialsSize = (
      draftContent.materials?.videos?.length || 0
    ) + (
      draftContent.materials?.texts?.length || 0
    ) + (
      draftContent.materials?.audios?.length || 0
    );
    const draftCoverBlob = await buildCapCutDraftCoverBlob(width || 320, height || 180);
    const attachmentPcTimelineJson = buildCapCutAttachmentPcTimeline();
    const attachmentScriptVideoJson = buildCapCutAttachmentScriptVideo();
    const attachmentActionSceneJson = buildCapCutAttachmentActionScene();
    const attachmentPcCommonJson = buildCapCutAttachmentPcCommon();
    const attachmentEditingJson = buildCapCutAttachmentEditing();
    const draftExtra = buildCapCutOpaqueDraftExtra();

    // [FIX #610] 모든 draft 파일을 projectId/ 폴더 아래에 배치
    zip.file(`${pId}/draft_content.json`, draftResult.json);
    zip.file(`${pId}/draft_info.json`, draftResult.json);
    zip.file(`${pId}/draft_settings`, buildCapCutDraftSettings(nowTs, width, height, detectCapCutDesktopPlatform(), draftTimelineMaterialsSize, draftTotalDurUs / 1_000_000));
    zip.file(`${pId}/draft_meta_info.json`, buildCapCutDraftMetaInfo({
      draftFolderId: pId,
      draftId: draftResult.scaffoldIds.draftId,
      title,
      tmDuration: draftTotalDurUs,
      tmDraftModifiedUs: nowUs,
      draftTimelineMaterialsSize,
    }));
    zip.file(`${pId}/Timelines/project.json`, buildCapCutTimelineProject(draftResult.scaffoldIds.timelineProjectId, draftResult.scaffoldIds.timelineId, nowUs));
    zip.file(`${pId}/common_attachment/attachment_pc_timeline.json`, attachmentPcTimelineJson);
    zip.file(`${pId}/common_attachment/attachment_script_video.json`, attachmentScriptVideoJson);
    zip.file(`${pId}/common_attachment/attachment_action_scene.json`, attachmentActionSceneJson);
    zip.file(`${pId}/common_attachment/coperate_create.json`, buildCapCutCooperateCreate());
    zip.file(`${pId}/attachment_pc_common.json`, attachmentPcCommonJson);
    zip.file(`${pId}/attachment_editing.json`, attachmentEditingJson);
    zip.file(`${pId}/timeline_layout.json`, buildCapCutTimelineLayout(draftResult.scaffoldIds.timelineId));
    zip.file(`${pId}/draft_virtual_store.json`, buildCapCutDraftVirtualStore());
    zip.file(`${pId}/key_value.json`, draftResult.keyValueJson);
    zip.file(`${pId}/draft_biz_config.json`, buildCapCutDraftBizConfig(draftResult.scaffoldIds.timelineId, draftResult.trackIds));
    zip.file(`${pId}/draft_agency_config.json`, buildCapCutDraftAgencyConfig());
    zip.file(`${pId}/performance_opt_info.json`, buildCapCutPerformanceOptInfo());
    zip.file(`${pId}/draft.extra`, draftExtra);
    zip.file(`${pId}/crypto_key_store.dat`, buildCapCutOpaqueCryptoKeyStore());
    zip.file(`${pId}/draft_cover.jpg`, draftCoverBlob);
    addCapCutDesktopInstallerFiles({
      zip,
      projectFolderId: pId,
    });
    addCapCutMainTimelineMirror({
      zip,
      projectFolderId: pId,
      mainTimelineId: draftResult.scaffoldIds.timelineId,
      draftJson: draftResult.json,
      attachmentPcCommonJson,
      attachmentEditingJson,
      attachmentPcTimelineJson,
      attachmentScriptVideoJson,
      attachmentActionSceneJson,
      draftExtra,
      draftCover: draftCoverBlob,
    });

    // CapCut 자체 draft는 materials/ 아래 self-contained 미디어를 사용
    if (videoBlob) {
      zip.file(`${pId}/materials/video/${videoFileName || 'video.mp4'}`, videoBlob);
      // XML용 media/ 폴더에도 배치
      zip.file(`media/${videoFileName || 'video.mp4'}`, videoBlob);
    }
    for (const narrationEntry of packagedNarrationBlobs) {
      zip.file(`${pId}/materials/audio/${narrationEntry.fileName}`, narrationEntry.blob);
    }

    // 4. SRT — CapCut 타임라인 기준 (draft JSON의 target_timerange와 싱크)
    // [FIX #622] 기존 source timing → timeline timing 변경 — CapCut은 클립을 재배치하므로 source 기준 SRT는 싱크 어긋남
    const dlgSrt = generateNleSrt(scenes, 'dialogue', preset, 'timeline', packagedNarrationLines);
    if (dlgSrt) zip.file(`${safeName}_자막.srt`, BOM + dlgSrt);
    const fxSrt = generateNleSrt(scenes, 'effect', preset, 'timeline', packagedNarrationLines);
    if (fxSrt) zip.file(`${safeName}_효과자막.srt`, BOM + fxSrt);
    // 원본 소스 시간 기준 SRT도 별도 제공 (수동 import 폴백용)
    const dlgSrtSrc = generateNleSrt(scenes, 'dialogue', preset, 'source', packagedNarrationLines);
    if (dlgSrtSrc) zip.file(`${safeName}_자막_원본시간.srt`, BOM + dlgSrtSrc);

    zip.file('README.txt', [
      `=== ${title} — CapCut ===`,
      '',
      '★ 추천: 설치 스크립트 실행 (절대경로 패치 + 미디어 자동 연결)',
      '1. CapCut 데스크톱을 완전히 종료합니다.',
      '2. ZIP 압축을 해제합니다.',
      `3. Mac은 "${CAPCUT_MAC_INSTALLER_NAME}", Windows는 "${CAPCUT_WINDOWS_BATCH_INSTALLER_NAME}"를 실행합니다.`,
      `4. 스크립트가 "${pId}" 폴더를 CapCut 프로젝트 경로에 복사하고 미디어 경로를 이 PC 기준 절대경로로 바꿉니다.`,
      '5. 설치가 끝나면 CapCut을 다시 실행하거나, 이미 켜졌다면 프로젝트 카드를 다시 눌러 확인합니다.',
      '',
      '[ 수동 복사만 하면 안 되는 이유 ]',
      '• 최신 CapCut 데스크톱은 imported draft의 media path를 상대경로만으로는 못 찾는 경우가 있습니다.',
      '• 그래서 설치 시점에 현재 컴퓨터 경로로 media path를 다시 써줘야 Media Not Found가 사라집니다.',
      '',
      '[ 대안: XML import ]',
      '1. CapCut 데스크톱 > File > Import > XML File',
      `2. "${safeName}.xml" 선택`,
      '',
      '[ 대안: 원본 영상 + SRT import ]',
      `1. media/${videoFileName || 'video.mp4'} 불러오기`,
      `2. 자막 > 자막 가져오기 > "${safeName}_자막_원본시간.srt" 선택`,
      '3. 이 SRT는 원본 소스 영상 시간 기준입니다.',
      `   (프로젝트 폴더 방식에서는 "${safeName}_자막.srt"를 사용하세요 — 타임라인 기준)`,
      '',
      `* 편집점: ${scenes.length}개 / 해상도: ${width}x${height} / ${fps}fps`,
    ].join('\n'));

  } else {
    // VREW — SRT 자막 + 영상 패키지
    // VREW는 SRT import만 지원 (XML import 미지원, XML은 export만 가능)

    // 1. 영상 파일
    if (videoBlob) {
      zip.file(`media/${videoFileName || 'video.mp4'}`, videoBlob);
    }

    // 2. SRT 자막
    const srt = generateNleSrt(scenes, 'dialogue', preset, 'source', packagedNarrationLines);
    if (srt) zip.file(`${safeName}_자막.srt`, BOM + srt);
    const narSrt = generateNleSrt(scenes, 'narration', preset, 'source', packagedNarrationLines);
    if (narSrt) zip.file(`${safeName}_나레이션.srt`, BOM + narSrt);
    const fxSrt = generateNleSrt(scenes, 'effect', preset, 'source', packagedNarrationLines);
    if (fxSrt) zip.file(`${safeName}_효과자막.srt`, BOM + fxSrt);

    zip.file('README.txt', [
      `=== ${title} — VREW ===`,
      '',
      '[ 사용법 ]',
      '1. VREW를 열고 media/ 폴더의 영상을 불러옵니다.',
      `2. 자막 > 자막 파일 불러오기 > "${safeName}_자막.srt" 선택`,
      '3. 자막이 타임라인에 자동 배치됩니다.',
      '4. SRT는 원본 소스 영상 시간 기준입니다.',
      '',
      '[ 포함된 파일 ]',
      `• ${safeName}_자막.srt — 대사 자막`,
      narSrt ? `• ${safeName}_나레이션.srt — 나레이션` : null,
      fxSrt ? `• ${safeName}_효과자막.srt — 효과 자막` : null,
      '',
      `* 편집점: ${scenes.length}개 / 해상도: ${width}x${height} / ${fps}fps`,
    ].filter(Boolean).join('\n'));
  }

  return zip.generateAsync({ type: 'blob', compression: 'STORE' });
}

// ──────────────────────────────────────────────
// 편집실(EditPoint) EdlEntry 기반 — FCP XML + ZIP
// ──────────────────────────────────────────────

/** EdlEntry[] → FCP XML (xmeml v5) — 편집실의 정밀 편집점 기반 */
export function generateFcpXmlFromEdl(params: {
  entries: EdlEntry[];
  sourceVideos: SourceVideoFile[];
  sourceMapping: Record<string, string>;
  title?: string;
  fps?: number;
  width?: number;
  height?: number;
}): string {
  // [FIX #316] 기본값을 9:16(1080x1920)으로 변경
  const { entries, sourceVideos, sourceMapping, title = 'Edit Project', fps = 30, width = 1080, height = 1920 } = params;
  if (entries.length === 0) return '';

  const { ntsc, timebase } = fpsToNtsc(fps);
  const ntscStr = ntsc ? 'TRUE' : 'FALSE';
  const tcFormat = ntsc ? 'DF' : 'NDF';
  const toFrames = (sec: number) => Math.round(sec * fps);
  const subtitleOrigin = getSubtitleOrigin(width, height);
  const safeTitle = escXml(title);

  // 소스 파일 정보 (중복 제거)
  const fileMap = new Map<string, { id: string; name: string; dur: number }>();
  let fileIdx = 1;
  for (const entry of entries) {
    const videoId = sourceMapping[entry.sourceId];
    if (videoId && !fileMap.has(videoId)) {
      const sv = sourceVideos.find(v => v.id === videoId);
      fileMap.set(videoId, {
        id: `file-${fileIdx}`,
        name: sanitizeFileName(sv?.fileName || `source_${fileIdx}.mp4`),
        dur: sv?.durationSec || 300,
      });
      fileIdx++;
    }
  }

  // 총 길이 계산 (누적)
  let recordIn = 0;
  const clips: { entry: EdlEntry; recStart: number; recEnd: number; fileInfo: { id: string; name: string; dur: number } }[] = [];
  for (const entry of entries) {
    const start = entry.refinedTimecodeStart ?? entry.timecodeStart;
    const end = entry.refinedTimecodeEnd ?? entry.timecodeEnd;
    const dur = (end - start) / entry.speedFactor;
    const videoId = sourceMapping[entry.sourceId];
    const fileInfo = fileMap.get(videoId || '') || { id: 'file-1', name: 'source.mp4', dur: 300 };
    clips.push({ entry, recStart: recordIn, recEnd: recordIn + dur, fileInfo });
    recordIn += dur;
  }

  const totalFrames = toFrames(recordIn);

  // 파일 정의 XML (인라인 정의용 — 각 file의 첫 참조 시 전체 정의)
  const fileDefs = new Map<string, string>();
  for (const f of fileMap.values()) {
    fileDefs.set(f.id, `
              <name>${escXml(f.name)}</name>
              <pathurl>${escXml(f.name)}</pathurl>
              <duration>${toFrames(f.dur)}</duration>
              <rate><ntsc>${ntscStr}</ntsc><timebase>${timebase}</timebase></rate>
              <media>
                <video><samplecharacteristics><width>${width}</width><height>${height}</height><anamorphic>FALSE</anamorphic><pixelaspectratio>square</pixelaspectratio><fielddominance>none</fielddominance></samplecharacteristics></video>
                <audio><channelcount>2</channelcount><samplecharacteristics><samplerate>48000</samplerate><depth>16</depth></samplecharacteristics></audio>
              </media>`);
  }

  // ── 시퀀스 마커 (편집점마다 — Shift+M으로 즉시 네비게이션) ──
  const markers = clips.map((c, i) => {
    const markerName = `${c.entry.order} ${c.entry.sourceDescription.slice(0, 50)}`;
    return `
    <marker>
      <name>${escXml(markerName)}</name>
      <comment>${escXml(c.entry.narrationText.slice(0, 200))}</comment>
      <in>${toFrames(c.recStart)}</in>
      <out>-1</out>
    </marker>`;
  }).join('');

  // ── V1 비디오 클립 (링크 + 메타데이터 + 라벨) ──
  const definedFiles = new Set<string>();
  const videoClips = clips.map((c, i) => {
    const start = c.entry.refinedTimecodeStart ?? c.entry.timecodeStart;
    const end = c.entry.refinedTimecodeEnd ?? c.entry.timecodeEnd;
    const fid = c.fileInfo.id;
    let fileTag: string;
    if (!definedFiles.has(fid) && fileDefs.has(fid)) {
      fileTag = `<file id="${fid}">${fileDefs.get(fid)!}\n            </file>`;
      definedFiles.add(fid);
    } else {
      fileTag = `<file id="${fid}"/>`;
    }
    // 배속 기반 색상: 정배속=Iris, 고속=Mango, 저속=Lavender
    const color = c.entry.speedFactor > 1.1 ? 'Mango' : c.entry.speedFactor < 0.9 ? 'Lavender' : 'Iris';
    return `
          <clipitem id="clip-${i + 1}" premiereChannelType="stereo">
            <masterclipid>masterclip-${fid.replace('file-', '')}</masterclipid>
            <name>${escXml(`${c.entry.order} ${c.entry.sourceDescription.slice(0, 35)}`)}</name>
            <duration>${toFrames(c.fileInfo.dur)}</duration>
            <rate><ntsc>${ntscStr}</ntsc><timebase>${timebase}</timebase></rate>
            <in>${toFrames(start)}</in>
            <out>${toFrames(end)}</out>
            <start>${toFrames(c.recStart)}</start>
            <end>${toFrames(c.recEnd)}</end>
            ${fileTag}
            <sourcetrack>
              <mediatype>video</mediatype>
              <trackindex>1</trackindex>
            </sourcetrack>
            <labels><label2>${color}</label2></labels>
            <logginginfo>
              <description>${escXml(c.entry.sourceDescription)}</description>
              <scene>${escXml(c.entry.order)}</scene>
              <lognote>${escXml(c.entry.narrationText)}</lognote>
            </logginginfo>
            <comments>
              <mastercomment1>${escXml(c.entry.narrationText.slice(0, 200))}</mastercomment1>
            </comments>
            <link>
              <linkclipref>clip-${i + 1}</linkclipref>
              <mediatype>video</mediatype>
              <trackindex>1</trackindex>
              <clipindex>${i + 1}</clipindex>
            </link>
            <link>
              <linkclipref>audio-${i + 1}</linkclipref>
              <mediatype>audio</mediatype>
              <trackindex>1</trackindex>
              <clipindex>${i + 1}</clipindex>
            </link>
          </clipitem>`;
  }).join('');

  // ── V2 나레이션 자막 트랙 (편집실 — narrationText 기반) ──
  const edlSubtitleClips = clips.filter(c => c.entry.narrationText).map((c, i) => {
    const durFrames = toFrames(c.recEnd - c.recStart);
    return `
          <generatoritem id="edl-sub-${i + 1}">
            <name>${escXml(c.entry.narrationText.slice(0, 40))}</name>
            <duration>${durFrames}</duration>
            <rate><ntsc>${ntscStr}</ntsc><timebase>${timebase}</timebase></rate>
            <in>0</in>
            <out>${durFrames}</out>
            <start>${toFrames(c.recStart)}</start>
            <end>${toFrames(c.recEnd)}</end>
            <enabled>TRUE</enabled>
            <anamorphic>FALSE</anamorphic>
            <alphatype>black</alphatype>
            <effect>
              <name>Text</name>
              <effectid>Text</effectid>
              <effectcategory>Text</effectcategory>
              <effecttype>generator</effecttype>
              <mediatype>video</mediatype>
              <parameter><parameterid>str</parameterid><name>Text</name><value>${escXml(c.entry.narrationText)}</value></parameter>
              <parameter><parameterid>fontsize</parameterid><name>Font Size</name><value>42</value></parameter>
              <parameter><parameterid>fontstyle</parameterid><name>Font Style</name><value>1</value></parameter>
              <parameter><parameterid>fontcolor</parameterid><name>Font Color</name><value>16777215</value></parameter>
              <parameter><parameterid>origin</parameterid><name>Origin</name><value>${subtitleOrigin.main}</value></parameter>
            </effect>
          </generatoritem>`;
  }).join('');

  // ── A1 오디오 클립 (링크 + 라벨) ──
  const audioClips = clips.map((c, i) => {
    const start = c.entry.refinedTimecodeStart ?? c.entry.timecodeStart;
    const end = c.entry.refinedTimecodeEnd ?? c.entry.timecodeEnd;
    const color = c.entry.speedFactor > 1.1 ? 'Mango' : c.entry.speedFactor < 0.9 ? 'Lavender' : 'Iris';
    return `
          <clipitem id="audio-${i + 1}">
            <masterclipid>masterclip-${c.fileInfo.id.replace('file-', '')}</masterclipid>
            <name>${escXml(`Audio ${c.entry.order}`)}</name>
            <duration>${toFrames(c.fileInfo.dur)}</duration>
            <rate><ntsc>${ntscStr}</ntsc><timebase>${timebase}</timebase></rate>
            <in>${toFrames(start)}</in>
            <out>${toFrames(end)}</out>
            <start>${toFrames(c.recStart)}</start>
            <end>${toFrames(c.recEnd)}</end>
            <file id="${c.fileInfo.id}"/>
            <sourcetrack>
              <mediatype>audio</mediatype>
              <trackindex>1</trackindex>
            </sourcetrack>
            <labels><label2>${color}</label2></labels>
            <link>
              <linkclipref>clip-${i + 1}</linkclipref>
              <mediatype>video</mediatype>
              <trackindex>1</trackindex>
              <clipindex>${i + 1}</clipindex>
            </link>
            <link>
              <linkclipref>audio-${i + 1}</linkclipref>
              <mediatype>audio</mediatype>
              <trackindex>1</trackindex>
              <clipindex>${i + 1}</clipindex>
            </link>
          </clipitem>`;
  }).join('');

  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE xmeml>
<xmeml version="5">
  <sequence>
    <name>${safeTitle}</name>
    <duration>${totalFrames}</duration>
    <rate><ntsc>${ntscStr}</ntsc><timebase>${timebase}</timebase></rate>
    <timecode>
      <rate><ntsc>${ntscStr}</ntsc><timebase>${timebase}</timebase></rate>
      <string>${secondsToFcpTc(0, fps)}</string>
      <frame>0</frame>
      <displayformat>${tcFormat}</displayformat>
    </timecode>${markers}
    <media>
      <video>
        <format>
          <samplecharacteristics>
            <width>${width}</width><height>${height}</height>
            <anamorphic>FALSE</anamorphic>
            <pixelaspectratio>square</pixelaspectratio>
            <fielddominance>none</fielddominance>
            <rate><ntsc>${ntscStr}</ntsc><timebase>${timebase}</timebase></rate>
            <colordepth>24</colordepth>
          </samplecharacteristics>
        </format>
        <track>${videoClips}
        </track>${edlSubtitleClips ? `
        <track>
          <enabled>TRUE</enabled>${edlSubtitleClips}
        </track>` : ''}
      </video>
      <audio>
        <numOutputChannels>2</numOutputChannels>
        <format><samplecharacteristics><samplerate>48000</samplerate><depth>16</depth></samplecharacteristics></format>
        <outputs>
          <group>
            <index>1</index>
            <numchannels>2</numchannels>
            <downmix>0</downmix>
            <channel><index>1</index></channel>
            <channel><index>2</index></channel>
          </group>
        </outputs>
        <track>
          <outputchannelindex>1</outputchannelindex>${audioClips}
        </track>
      </audio>
    </media>
  </sequence>
</xmeml>`;
}

/** EdlEntry[] → 나레이션 SRT (편집실용, 누적 타임코드) */
export function generateEdlNarrationSrt(entries: EdlEntry[]): string {
  let cumTime = 0;
  let idx = 1;
  const parts: string[] = [];
  for (const e of entries) {
    const start = e.refinedTimecodeStart ?? e.timecodeStart;
    const end = e.refinedTimecodeEnd ?? e.timecodeEnd;
    const dur = (end - start) / e.speedFactor;
    if (e.narrationText.trim()) {
      parts.push(`${idx}\n${secondsToSrtTime(cumTime)} --> ${secondsToSrtTime(cumTime + dur)}\n${breakLines(e.narrationText)}`);
      idx++;
    }
    cumTime += dur;
  }
  return parts.join('\n\n');
}

/** 편집실 EdlEntry → NLE ZIP 패키지 (Premiere/CapCut/VREW) */
export async function buildEdlNlePackageZip(params: {
  target: NleTarget;
  entries: EdlEntry[];
  sourceVideos: SourceVideoFile[];
  sourceMapping: Record<string, string>;
  title?: string;
}): Promise<Blob> {
  const { target, entries, sourceVideos, sourceMapping, title = 'Edit Project' } = params;
  const JSZip = (await import('jszip')).default;
  const zip = new JSZip();
  const safeName = sanitizeProjectName(title);
  const BOM = '\uFEFF';

  const srt = generateEdlNarrationSrt(entries);

  if (target === 'premiere') {
    const xml = generateFcpXmlFromEdl({ entries, sourceVideos, sourceMapping, title });
    zip.file(`${safeName}.xml`, xml);
    if (srt) zip.file(`${safeName}_나레이션.srt`, BOM + srt);

    const sourceNames = [...new Set(entries.map(e => e.sourceDescription))].join(', ');
    zip.file('README.txt', [
      `=== ${title} — Premiere Pro / DaVinci Resolve ===`,
      '',
      '[ 가져오기 ]',
      '1. 소스 영상을 XML 파일과 같은 폴더에 배치하세요.',
      '2. Premiere Pro > File > Import (Ctrl+I)',
      `3. "${safeName}.xml" 선택 → 타임라인 자동 생성`,
      '',
      '[ 타임라인 활용 ]',
      `• 마커(Marker): 편집점마다 마커 설정됨 → Shift+M / Ctrl+Shift+M으로 이동`,
      '• 클립 색상: 보라(정배속) / 주황(고속) / 연보라(슬로우)',
      '• 메타데이터: Window > Metadata에서 나레이션 텍스트 확인',
      '• 비디오+오디오 연결됨: 함께 이동·트림됩니다.',
      '',
      '[ 자막 추가 (선택) ]',
      `• File > Import > "${safeName}_나레이션.srt" → 타임라인에 드래그`,
      '',
      '[ 프로젝트 정보 ]',
      `• 편집점: ${entries.length}개 (Vision AI 정제 타임코드)`,
      `• 소스: ${sourceNames.slice(0, 100)}`,
    ].join('\n'));
  } else if (target === 'capcut') {
    const xml = generateFcpXmlFromEdl({ entries, sourceVideos, sourceMapping, title });
    zip.file(`${safeName}.xml`, xml);
    if (srt) zip.file(`${safeName}_나레이션.srt`, BOM + srt);
    const sourceNames = [...new Set(entries.map(e => e.sourceDescription))].join(', ');
    zip.file('README.txt', [
      `=== ${title} — CapCut ===`,
      '',
      '[ 가져오기 ]',
      '1. 소스 영상을 XML 파일과 같은 폴더에 배치하세요.',
      '2. CapCut 데스크톱 > File > Import > XML File',
      `3. "${safeName}.xml" 선택 → 컷 순서와 길이가 복원됩니다.`,
      '',
      '[ 자막 ]',
      srt
        ? `• "${safeName}_나레이션.srt" 를 자막 가져오기로 추가할 수 있습니다.`
        : '• 나레이션 SRT는 비어 있어 포함되지 않았습니다.',
      '',
      '[ 프로젝트 정보 ]',
      `• 편집점: ${entries.length}개 (Vision AI 정제 타임코드)`,
      `• 소스: ${sourceNames.slice(0, 100)}`,
    ].join('\n'));
  } else {
    // VREW — 소스 영상 포함 불가(다중 소스), SRT만 제공
    if (srt) zip.file(`${safeName}_나레이션.srt`, BOM + srt);
    zip.file('README.txt', [
      `=== ${title} — VREW ===`,
      '',
      '1. VREW에서 소스 영상을 불러옵니다.',
      `2. 자막 > 자막 파일 불러오기 > "${safeName}_나레이션.srt" 선택`,
      `* ${entries.length}개 편집점 기반 나레이션 SRT`,
    ].join('\n'));
  }

  return zip.generateAsync({ type: 'blob', compression: 'STORE' });
}

// ──────────────────────────────────────────────
// 편집실 타임라인 → NLE 내보내기 (CapCut / Premiere / VREW)
// ──────────────────────────────────────────────

export type EditRoomNleTarget = 'premiere' | 'capcut' | 'vrew';

interface EditRoomScene {
  id: string;
  imageUrl?: string;
  videoUrl?: string;
  scriptText?: string;
}

interface EditRoomNarrationLine {
  sceneId?: string;
  audioUrl?: string;
  duration?: number;
  startTime?: number;
  index?: number;
}

interface EditRoomNarrationClip {
  fileName: string;
  startSec: number;
  durationSec: number;
}

function roundMotionValue(value: number, digits = 6): number {
  return Number(value.toFixed(digits));
}

function normalizeCapCutPosition(valuePx: number, axisSize: number): number {
  return axisSize > 0 ? valuePx / (axisSize / 2) : 0;
}

function normalizeFcpPosition(valuePx: number, axisSize: number): number {
  return axisSize > 0 ? (valuePx / (axisSize / 2)) * 100 : 0;
}

function firstTrackValue(track: NleMotionKeyframe[], fallback: number): number {
  return track.length > 0 ? track[0].value : fallback;
}

function sampleTrackValue(track: NleMotionKeyframe[], timeSec: number, fallback: number): number {
  if (track.length === 0) return fallback;
  if (timeSec <= track[0].timeSec) return track[0].value;
  if (timeSec >= track[track.length - 1].timeSec) return track[track.length - 1].value;

  for (let i = 1; i < track.length; i++) {
    if (timeSec <= track[i].timeSec) {
      const prev = track[i - 1];
      const next = track[i];
      const span = next.timeSec - prev.timeSec;
      const ratio = span <= 0 ? 0 : (timeSec - prev.timeSec) / span;
      return prev.value + (next.value - prev.value) * ratio;
    }
  }

  return fallback;
}

function hasNleMotion(track: NleMotionTrack | null | undefined): boolean {
  if (!track) return false;
  return track.hasTransformMotion || track.hasOpacityMotion;
}

function buildCapCutClipSettings(track: NleMotionTrack | null, width: number, height: number) {
  if (!track) {
    return {
      alpha: 1.0,
      flip: { horizontal: false, vertical: false },
      rotation: 0.0,
      scale: { x: 1.0, y: 1.0 },
      transform: { x: 0.0, y: 0.0 },
    };
  }

  const scale = roundMotionValue(firstTrackValue(track.scale, 1.0));
  return {
    alpha: roundMotionValue(firstTrackValue(track.opacity, 1.0)),
    flip: { horizontal: false, vertical: false },
    rotation: roundMotionValue(firstTrackValue(track.rotation, 0.0)),
    scale: { x: scale, y: scale },
    transform: {
      x: roundMotionValue(normalizeCapCutPosition(firstTrackValue(track.translateX, 0.0), width)),
      y: roundMotionValue(normalizeCapCutPosition(firstTrackValue(track.translateY, 0.0), height)),
    },
  };
}

function buildCapCutPropertyKeyframes(
  propertyType: string,
  keyframes: NleMotionKeyframe[],
  mapper: (value: number) => number,
): Array<{
  id: string;
  keyframe_list: Array<{
    curveType: string;
    graphID: string;
    id: string;
    left_control: { x: number; y: number };
    right_control: { x: number; y: number };
    string_value: string;
    time_offset: number;
    values: number[];
  }>;
  material_id: string;
  property_type: string;
}> {
  if (keyframes.length === 0) return [];
  return [{
    id: uuid(),
    keyframe_list: keyframes.map((keyframe) => ({
      curveType: 'Line',
      graphID: '',
      id: uuid(),
      left_control: { x: 0, y: 0 },
      right_control: { x: 0, y: 0 },
      string_value: '',
      time_offset: toUs(keyframe.timeSec),
      values: [roundMotionValue(mapper(keyframe.value))],
    })),
    material_id: '',
    property_type: propertyType,
  }];
}

function buildCapCutCommonKeyframes(track: NleMotionTrack | null, width: number, height: number) {
  if (!track) return [];
  return [
    ...buildCapCutPropertyKeyframes('KFTypePositionX', track.translateX, (value) => normalizeCapCutPosition(value, width)),
    ...buildCapCutPropertyKeyframes('KFTypePositionY', track.translateY, (value) => normalizeCapCutPosition(value, height)),
    ...buildCapCutPropertyKeyframes('KFTypeScaleX', track.scale, (value) => value),
    ...buildCapCutPropertyKeyframes('KFTypeScaleY', track.scale, (value) => value),
    ...buildCapCutPropertyKeyframes('KFTypeRotation', track.rotation, (value) => value),
    ...buildCapCutPropertyKeyframes('KFTypeGlobalAlpha', track.opacity, (value) => value),
  ];
}

function buildFcpScalarParameterXml(
  parameterId: string,
  name: string,
  keyframes: NleMotionKeyframe[],
  fps: number,
  mapper: (value: number) => number,
  interpolation: NleMotionInterpolation,
): string {
  if (keyframes.length === 0) return '';
  const baseValue = roundMotionValue(mapper(keyframes[0].value), 4);
  const xmlKeyframes = keyframes.map((keyframe) => `
                <keyframe>
                  <when>${Math.max(0, Math.round(keyframe.timeSec * fps))}</when>
                  <value>${roundMotionValue(mapper(keyframe.value), 4)}</value>
                  <interpolation><name>${interpolation}</name></interpolation>
                </keyframe>`).join('');
  return `
              <parameter>
                <parameterid>${parameterId}</parameterid>
                <name>${name}</name>
                <value>${baseValue}</value>${xmlKeyframes}
              </parameter>`;
}

function buildFcpCenterParameterXml(
  track: NleMotionTrack,
  fps: number,
  width: number,
  height: number,
  interpolation: NleMotionInterpolation,
): string {
  const timeSet = new Set<number>();
  track.translateX.forEach(({ timeSec }) => timeSet.add(timeSec));
  track.translateY.forEach(({ timeSec }) => timeSet.add(timeSec));
  if (timeSet.size === 0) return '';

  const times = [...timeSet].sort((a, b) => a - b);
  const baseX = roundMotionValue(normalizeFcpPosition(sampleTrackValue(track.translateX, times[0], 0), width), 4);
  const baseY = roundMotionValue(normalizeFcpPosition(sampleTrackValue(track.translateY, times[0], 0), height), 4);
  const xmlKeyframes = times.map((timeSec) => {
    const x = roundMotionValue(normalizeFcpPosition(sampleTrackValue(track.translateX, timeSec, 0), width), 4);
    const y = roundMotionValue(normalizeFcpPosition(sampleTrackValue(track.translateY, timeSec, 0), height), 4);
    return `
                <keyframe>
                  <when>${Math.max(0, Math.round(timeSec * fps))}</when>
                  <value><horiz>${x}</horiz><vert>${y}</vert></value>
                  <interpolation><name>${interpolation}</name></interpolation>
                </keyframe>`;
  }).join('');

  return `
              <parameter>
                <parameterid>center</parameterid>
                <name>Center</name>
                <value><horiz>${baseX}</horiz><vert>${baseY}</vert></value>${xmlKeyframes}
              </parameter>`;
}

function buildFcpMotionFilterXml(
  track: NleMotionTrack | null,
  fps: number,
  width: number,
  height: number,
  scaleBase = 1,
): string {
  if (!hasNleMotion(track) || !track) return '';

  const scaleXml = buildFcpScalarParameterXml('scale', 'Scale', track.scale, fps, (value) => value * scaleBase * 100, track.transformInterpolation);
  const centerXml = buildFcpCenterParameterXml(track, fps, width, height, track.transformInterpolation);
  const rotationXml = buildFcpScalarParameterXml('rotation', 'Rotation', track.rotation, fps, (value) => value, track.transformInterpolation);
  const opacityXml = buildFcpScalarParameterXml('opacity', 'Opacity', track.opacity, fps, (value) => value * 100, track.opacityInterpolation);
  const parameters = [scaleXml, centerXml, rotationXml, opacityXml].filter(Boolean).join('');
  if (!parameters) return '';

  return `
            <filter>
              <enabled>TRUE</enabled>
              <start>-1</start>
              <end>-1</end>
              <effect id="basicmotion">
                <name>Basic Motion</name>
                <effectid>basic</effectid>
                <effectcategory>motion</effectcategory>
                <effecttype>motion</effecttype>
                <mediatype>video</mediatype>${parameters}
              </effect>
            </filter>`;
}

/** 편집실 타임라인 → SRT 문자열 */
function buildEditRoomSrt(timeline: UnifiedSceneTiming[]): string {
  let idx = 1;
  const entries: string[] = [];
  for (const t of timeline) {
    for (const seg of t.subtitleSegments) {
      if (!seg.text.trim()) continue;
      entries.push(`${idx}\n${secondsToSrtTime(seg.startTime)} --> ${secondsToSrtTime(seg.endTime)}\n${breakLines(seg.text)}`);
      idx++;
    }
  }
  return entries.join('\n\n');
}

/** 편집실 타임라인 → FCP XML (xmeml v5) — 이미지/영상 클립 시퀀스 + 오디오 트랙 */
function buildEditRoomFcpXml(params: {
  timeline: UnifiedSceneTiming[];
  scenes: EditRoomScene[];
  title: string;
  fps: number;
  width: number;
  height: number;
  /** 실제 ZIP에 들어간 미디어 파일명 맵 (index → 파일명). 없으면 scene.videoUrl 기준 추정 */
  mediaFileMap?: Map<number, string>;
  /** 실제 ZIP에 들어간 나레이션 오디오 클립 목록 */
  narrationClips?: EditRoomNarrationClip[];
  stillImageScaleBase?: number;
}): string {
  const { timeline, scenes, title, fps, width, height, mediaFileMap, narrationClips, stillImageScaleBase = 1 } = params;
  if (timeline.length === 0) return '';

  const { ntsc, timebase } = fpsToNtsc(fps);
  const ntscStr = ntsc ? 'TRUE' : 'FALSE';
  const tcFormat = ntsc ? 'DF' : 'NDF';
  const toFrames = (sec: number) => Math.round(sec * fps);
  const subtitleOrigin = getSubtitleOrigin(width, height);
  const totalDurSec = timeline[timeline.length - 1].imageEndTime;
  const totalFrames = Math.ceil(totalDurSec * fps);
  const safeTitle = escXml(title);

  // 마커 (장면 경계)
  const markers = timeline.map((t, i) => {
    const scene = scenes.find(s => s.id === t.sceneId);
    const label = scene?.scriptText?.slice(0, 50) || `장면 ${i + 1}`;
    return `
    <marker>
      <name>${escXml(`#${i + 1} ${label}`)}</name>
      <comment></comment>
      <in>${toFrames(t.imageStartTime)}</in>
      <out>-1</out>
    </marker>`;
  }).join('');

  // 비디오 클립 (장면마다 별도 파일 + 오디오 미디어 스펙 포함)
  const videoClips = timeline.map((t, i) => {
    const scene = scenes.find(s => s.id === t.sceneId);
    // [FIX #472] mediaFileMap이 있으면 실제 다운로드된 파일 기준, 없으면 기존 로직
    const actualFile = mediaFileMap?.get(i);
    if (mediaFileMap && !actualFile) {
      throw new Error(`장면 ${i + 1}의 미디어 파일을 찾을 수 없습니다. 이미지/영상을 다시 확인해주세요.`);
    }
    const ext = actualFile ? actualFile.split('.').pop()! : (scene?.videoUrl ? 'mp4' : 'jpg');
    const fileName = actualFile ? `media/${actualFile}` : `media/${String(i + 1).padStart(3, '0')}_scene.${ext}`;
    const hasEmbeddedAudio = actualFile ? actualFile.toLowerCase().endsWith('.mp4') : !!scene?.videoUrl;
    const isStillImage = !hasEmbeddedAudio;
    const clipDurFrames = toFrames(t.imageDuration);
    const clipLabel = (scene?.scriptText || `장면 ${i + 1}`).slice(0, 40);
    const motionTrack = isStillImage
      ? compileNleMotionTrack(t, width, height, fps, { sampleMode: 'per-frame', simplify: false })
      : null;
    const motionFilterXml = buildFcpMotionFilterXml(motionTrack, fps, width, height, isStillImage ? stillImageScaleBase : 1);
    return `
          <clipitem id="clip-${i + 1}" premiereChannelType="stereo">
            <name>${escXml(`#${i + 1} ${clipLabel}`)}</name>
            <duration>${clipDurFrames}</duration>
            <rate><ntsc>${ntscStr}</ntsc><timebase>${timebase}</timebase></rate>
            <in>0</in>
            <out>${clipDurFrames}</out>
            <start>${toFrames(t.imageStartTime)}</start>
            <end>${toFrames(t.imageEndTime)}</end>${isStillImage ? `
            <stillframe>TRUE</stillframe>` : ''}
            <file id="file-${i + 1}">
              <name>${escXml(`${String(i + 1).padStart(3, '0')}_scene.${ext}`)}</name>
              <pathurl>${escXml(fileName)}</pathurl>
              <duration>${clipDurFrames}</duration>
              <rate><ntsc>${ntscStr}</ntsc><timebase>${timebase}</timebase></rate>
              <media>
                <video><samplecharacteristics><width>${width}</width><height>${height}</height><anamorphic>FALSE</anamorphic><pixelaspectratio>square</pixelaspectratio><fielddominance>none</fielddominance></samplecharacteristics></video>${hasEmbeddedAudio
                  ? `
                <audio><channelcount>2</channelcount><samplecharacteristics><samplerate>48000</samplerate><depth>16</depth></samplecharacteristics></audio>`
                  : ''}
              </media>
            </file>${motionFilterXml}
            <sourcetrack><mediatype>video</mediatype><trackindex>1</trackindex></sourcetrack>
            <labels><label2>Iris</label2></labels>
            <logginginfo>
              <description>${escXml(scene?.scriptText || '')}</description>
              <scene>${escXml(String(i + 1))}</scene>
            </logginginfo>
            <link>
              <linkclipref>clip-${i + 1}</linkclipref>
              <mediatype>video</mediatype>
              <trackindex>1</trackindex>
              <clipindex>${i + 1}</clipindex>
            </link>${hasEmbeddedAudio ? `
            <link>
              <linkclipref>audio-${i + 1}</linkclipref>
              <mediatype>audio</mediatype>
              <trackindex>1</trackindex>
              <clipindex>${i + 1}</clipindex>
            </link>` : ''}
          </clipitem>`;
  }).join('');

  // 오디오 클립 (비디오 클립에 링크)
  const audioClips = timeline.map((t, i) => {
    const actualFile = mediaFileMap?.get(i);
    const scene = scenes.find(s => s.id === t.sceneId);
    const hasEmbeddedAudio = actualFile ? actualFile.toLowerCase().endsWith('.mp4') : !!scene?.videoUrl;
    if (!hasEmbeddedAudio) return '';
    const clipDurFrames = toFrames(t.imageDuration);
    return `
          <clipitem id="audio-${i + 1}">
            <name>${escXml(`Audio ${String(i + 1).padStart(3, '0')}`)}</name>
            <duration>${clipDurFrames}</duration>
            <rate><ntsc>${ntscStr}</ntsc><timebase>${timebase}</timebase></rate>
            <in>0</in>
            <out>${clipDurFrames}</out>
            <start>${toFrames(t.imageStartTime)}</start>
            <end>${toFrames(t.imageEndTime)}</end>
            <file id="file-${i + 1}"/>
            <sourcetrack><mediatype>audio</mediatype><trackindex>1</trackindex></sourcetrack>
            <link>
              <linkclipref>clip-${i + 1}</linkclipref>
              <mediatype>video</mediatype>
              <trackindex>1</trackindex>
              <clipindex>${i + 1}</clipindex>
            </link>
            <link>
              <linkclipref>audio-${i + 1}</linkclipref>
              <mediatype>audio</mediatype>
              <trackindex>1</trackindex>
              <clipindex>${i + 1}</clipindex>
            </link>
          </clipitem>`;
  }).join('');
  const hasSceneAudioTrack = audioClips.replace(/\s/g, '').length > 0;

  // 자막 트랙
  const subtitleClips = timeline
    .flatMap(t => t.subtitleSegments.filter(seg => seg.text.trim()))
    .map((seg, i) => `
          <generatoritem id="sub-${i + 1}">
            <name>${escXml(seg.text.slice(0, 40))}</name>
            <duration>${toFrames(seg.endTime - seg.startTime)}</duration>
            <rate><ntsc>${ntscStr}</ntsc><timebase>${timebase}</timebase></rate>
            <in>0</in>
            <out>${toFrames(seg.endTime - seg.startTime)}</out>
            <start>${toFrames(seg.startTime)}</start>
            <end>${toFrames(seg.endTime)}</end>
            <enabled>TRUE</enabled>
            <anamorphic>FALSE</anamorphic>
            <alphatype>black</alphatype>
            <effect>
              <name>Text</name>
              <effectid>Text</effectid>
              <effectcategory>Text</effectcategory>
              <effecttype>generator</effecttype>
              <mediatype>video</mediatype>
              <parameter><parameterid>str</parameterid><name>Text</name><value>${escXml(seg.text)}</value></parameter>
              <parameter><parameterid>fontsize</parameterid><name>Font Size</name><value>42</value></parameter>
              <parameter><parameterid>fontstyle</parameterid><name>Font Style</name><value>1</value></parameter>
              <parameter><parameterid>fontcolor</parameterid><name>Font Color</name><value>16777215</value></parameter>
              <parameter><parameterid>origin</parameterid><name>Origin</name><value>${subtitleOrigin.main}</value></parameter>
            </effect>
          </generatoritem>`).join('');

  // 나레이션 오디오 트랙 (A2) — 라인 단위 다중 나레이션 MP3를 실제 길이로 배치
  const narrationTrackClips = (narrationClips || []).map((clip, i) => {
    const clipDurFrames = Math.max(1, toFrames(clip.durationSec));
    const clipStartFrames = Math.max(0, toFrames(clip.startSec));
    const clipEndFrames = clipStartFrames + clipDurFrames;
    return `
          <clipitem id="narration-${i + 1}" premiereChannelType="stereo">
            <name>${escXml(`Narration ${String(i + 1).padStart(3, '0')}`)}</name>
            <duration>${clipDurFrames}</duration>
            <rate><ntsc>${ntscStr}</ntsc><timebase>${timebase}</timebase></rate>
            <in>0</in>
            <out>${clipDurFrames}</out>
            <start>${clipStartFrames}</start>
            <end>${clipEndFrames}</end>
            <file id="narfile-${i + 1}">
              <name>${escXml(clip.fileName)}</name>
              <pathurl>${escXml(`audio/${clip.fileName}`)}</pathurl>
              <duration>${clipDurFrames}</duration>
              <rate><ntsc>${ntscStr}</ntsc><timebase>${timebase}</timebase></rate>
              <media>
                <audio><channelcount>2</channelcount><samplecharacteristics><samplerate>48000</samplerate><depth>16</depth></samplecharacteristics></audio>
              </media>
            </file>
            <sourcetrack><mediatype>audio</mediatype><trackindex>1</trackindex></sourcetrack>
            <labels><label2>Caribbean</label2></labels>
          </clipitem>`;
  }).join('');
  const hasNarrationTrack = narrationTrackClips.replace(/\s/g, '').length > 0;

  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE xmeml>
<xmeml version="5">
  <sequence>
    <name>${safeTitle}</name>
    <duration>${totalFrames}</duration>
    <rate><ntsc>${ntscStr}</ntsc><timebase>${timebase}</timebase></rate>
    <timecode>
      <rate><ntsc>${ntscStr}</ntsc><timebase>${timebase}</timebase></rate>
      <string>${secondsToFcpTc(0, fps)}</string>
      <frame>0</frame>
      <displayformat>${tcFormat}</displayformat>
    </timecode>${markers}
    <media>
      <video>
        <format>
          <samplecharacteristics>
            <width>${width}</width><height>${height}</height>
            <anamorphic>FALSE</anamorphic>
            <pixelaspectratio>square</pixelaspectratio>
            <fielddominance>none</fielddominance>
            <rate><ntsc>${ntscStr}</ntsc><timebase>${timebase}</timebase></rate>
            <colordepth>24</colordepth>
          </samplecharacteristics>
        </format>
        <track>${videoClips}
        </track>${subtitleClips ? `
        <track>
          <enabled>TRUE</enabled>${subtitleClips}
        </track>` : ''}
      </video>
      <audio>
        <numOutputChannels>2</numOutputChannels>
        <format>
          <samplecharacteristics>
            <samplerate>48000</samplerate>
            <depth>16</depth>
          </samplecharacteristics>
        </format>
        <outputs>
          <group>
            <index>1</index>
            <numchannels>2</numchannels>
            <downmix>0</downmix>
            <channel><index>1</index></channel>
            <channel><index>2</index></channel>
          </group>
        </outputs>
        ${hasSceneAudioTrack ? `<track>
          <outputchannelindex>1</outputchannelindex>${audioClips}
        </track>` : ''}${hasNarrationTrack ? `
        <track>
          <outputchannelindex>1</outputchannelindex>${narrationTrackClips}
        </track>` : ''}
      </audio>
    </media>
  </sequence>
</xmeml>`;
}

/** 이미지/영상 URL에서 Blob으로 fetch (data: / blob: / https: 모두 지원) */
async function fetchAssetBlob(url: string): Promise<Blob | null> {
  if (!url) return null;
  // data: URL → 직접 디코딩 (fetch 폴백 포함)
  if (url.startsWith('data:')) {
    try {
      const arr = url.split(',');
      const mime = arr[0].match(/:(.*?);/)?.[1] || 'application/octet-stream';
      const bstr = atob(arr[1]);
      const u8 = new Uint8Array(bstr.length);
      for (let i = 0; i < bstr.length; i++) u8[i] = bstr.charCodeAt(i);
      return new Blob([u8], { type: mime });
    } catch {
      // atob 실패 시 fetch 폴백
      try { const r = await fetch(url); return await r.blob(); } catch { return null; }
    }
  }
  // blob: URL
  if (url.startsWith('blob:')) {
    try { const r = await fetch(url); return await r.blob(); } catch { return null; }
  }
  // https / http URL
  try {
    const res = await fetch(url);
    if (res.ok) return await res.blob();
  } catch { /* CORS 실패 시 무시 */ }
  return null;
}

function getStillImageMime(blob: Blob): 'image/png' | 'image/jpeg' {
  return blob.type === 'image/png' ? 'image/png' : 'image/jpeg';
}

async function normalizeStillImageBlobForPremiere(
  blob: Blob,
  width: number,
  height: number,
): Promise<Blob> {
  if (typeof document === 'undefined' || typeof Image === 'undefined' || width <= 0 || height <= 0) {
    return blob;
  }

  const mime = getStillImageMime(blob);
  const blobUrl = URL.createObjectURL(blob);
  try {
    return await new Promise<Blob>((resolve) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = Math.max(2, Math.round(width));
        canvas.height = Math.max(2, Math.round(height));
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve(blob);
          return;
        }

        if (mime === 'image/jpeg') {
          ctx.fillStyle = '#000000';
          ctx.fillRect(0, 0, canvas.width, canvas.height);
        } else {
          ctx.clearRect(0, 0, canvas.width, canvas.height);
        }
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        // EditRoom 프리뷰와 동일하게 시퀀스 크기에 맞춰 강제로 리사이즈한다.
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        canvas.toBlob((value) => resolve(value || blob), mime, mime === 'image/jpeg' ? 0.92 : undefined);
      };
      img.onerror = () => resolve(blob);
      img.src = blobUrl;
    });
  } finally {
    URL.revokeObjectURL(blobUrl);
  }
}

/** Blob 오디오의 실제 재생 길이(초) 측정 */
async function measureBlobAudioDuration(blob: Blob): Promise<number | null> {
  if (typeof window === 'undefined' || typeof Audio === 'undefined') return null;
  const blobUrl = URL.createObjectURL(blob);
  try {
    return await new Promise<number | null>((resolve) => {
      const audio = new Audio();
      const cleanup = () => {
        audio.onloadedmetadata = null;
        audio.onerror = null;
      };
      const timeoutId = window.setTimeout(() => {
        cleanup();
        resolve(null);
      }, 5000);
      audio.preload = 'metadata';
      audio.onloadedmetadata = () => {
        cleanup();
        window.clearTimeout(timeoutId);
        const duration = Number.isFinite(audio.duration) && audio.duration > 0 ? audio.duration : null;
        resolve(duration);
      };
      audio.onerror = () => {
        cleanup();
        window.clearTimeout(timeoutId);
        resolve(null);
      };
      audio.src = blobUrl;
    });
  } finally {
    URL.revokeObjectURL(blobUrl);
  }
}

/** 편집실 타임라인 → CapCut 네이티브 SRT (장면별 통합 자막 — 가장 안정적 import 방법) */
function buildEditRoomSceneSrt(timeline: UnifiedSceneTiming[], scenes: EditRoomScene[]): string {
  const entries: string[] = [];
  for (let i = 0; i < timeline.length; i++) {
    const t = timeline[i];
    // 자막 세그먼트가 있으면 사용, 없으면 대본 텍스트 사용
    const segs = t.subtitleSegments.filter(seg => seg.text.trim());
    if (segs.length > 0) {
      for (const seg of segs) {
        entries.push(`${entries.length + 1}\n${secondsToSrtTime(seg.startTime)} --> ${secondsToSrtTime(seg.endTime)}\n${breakLines(seg.text)}`);
      }
    } else {
      const scene = scenes.find(s => s.id === t.sceneId);
      if (scene?.scriptText?.trim()) {
        entries.push(`${entries.length + 1}\n${secondsToSrtTime(t.imageStartTime)} --> ${secondsToSrtTime(t.imageEndTime)}\n${breakLines(scene.scriptText)}`);
      }
    }
  }
  return entries.join('\n\n');
}

function normalizeEditRoomTimelineForExport(
  timeline: UnifiedSceneTiming[],
  narrationLines: EditRoomNarrationLine[],
): { timeline: UnifiedSceneTiming[]; narrationLines: EditRoomNarrationLine[] } {
  if (timeline.length === 0) {
    return { timeline, narrationLines };
  }

  const timeShiftBySceneId = new Map<string, number>();
  let cursor = 0;

  const normalizedTimeline = timeline.map((scene, index) => {
    const sceneStart = cursor;
    const sceneEnd = sceneStart + scene.imageDuration;
    const timeShift = sceneStart - scene.imageStartTime;
    timeShiftBySceneId.set(scene.sceneId, timeShift);

    const subtitleSegments = scene.subtitleSegments.map((segment) => {
      const shiftedStart = segment.startTime + timeShift;
      const shiftedEnd = segment.endTime + timeShift;
      const startTime = Math.min(sceneEnd, Math.max(sceneStart, shiftedStart));
      const endTime = Math.min(sceneEnd, Math.max(startTime, shiftedEnd));
      return {
        ...segment,
        startTime,
        endTime,
      };
    });

    cursor = sceneEnd;
    return {
      ...scene,
      sceneIndex: index,
      imageStartTime: sceneStart,
      imageEndTime: sceneEnd,
      subtitleSegments,
    };
  });

  const normalizedNarrationLines = narrationLines.map((line) => {
    if (!line.sceneId) return line;
    const timeShift = timeShiftBySceneId.get(line.sceneId);
    if (timeShift === undefined) return line;
    if (typeof line.startTime !== 'number' || !Number.isFinite(line.startTime)) return line;
    return {
      ...line,
      startTime: Math.max(0, line.startTime + timeShift),
    };
  });

  return {
    timeline: normalizedTimeline,
    narrationLines: normalizedNarrationLines,
  };
}

/** NLE 내보내기 결과 (ZIP + 미디어 통계) */
export interface NleExportResult {
  blob: Blob;
  videoCount: number;
  imageCount: number;
  totalScenes: number;
}

/** 편집실 타임라인 → NLE 패키지 ZIP (CapCut / Premiere / VREW) */
export async function buildEditRoomNleZip(params: {
  target: EditRoomNleTarget;
  timeline: UnifiedSceneTiming[];
  scenes: EditRoomScene[];
  narrationLines: EditRoomNarrationLine[];
  title: string;
  aspectRatio: string;
  fps?: number;
}): Promise<NleExportResult> {
  const { target, timeline: rawTimeline, scenes, narrationLines: rawNarrationLines, title, aspectRatio, fps = 30 } = params;
  const { timeline, narrationLines } = normalizeEditRoomTimelineForExport(rawTimeline, rawNarrationLines);
  const JSZip = (await import('jszip')).default;
  const zip = new JSZip();
  const safeName = sanitizeProjectName(title);
  const BOM = '\uFEFF';

  // 해상도 결정
  let w = 1920, h = 1080;
  if (aspectRatio === '9:16') { w = 1080; h = 1920; }
  else if (aspectRatio === '1:1') { w = 1080; h = 1080; }
  else if (aspectRatio === '4:3') { w = 1440; h = 1080; }

  // SRT 자막 (모든 타겟에서 생성)
  const srtContent = buildEditRoomSrt(timeline);
  if (srtContent) zip.file(`${safeName}_자막.srt`, BOM + srtContent);

  // 장면별 통합 SRT (CapCut/VREW용 — 대본 텍스트 폴백 포함)
  const sceneSrt = buildEditRoomSceneSrt(timeline, scenes);
  if (sceneSrt && (target === 'capcut' || target === 'vrew')) {
    zip.file(`${safeName}_장면자막.srt`, BOM + sceneSrt);
  }

  // [FIX #472] 미디어 에셋 수집 — 영상 다운로드 실패 시 이미지 폴백 + 실제 파일명 추적
  const mediaFileMap = new Map<number, string>(); // index → 실제 파일명
  const mediaBlobMap = new Map<number, Blob>(); // index → Blob (CapCut 루트 복사용)
  const narrationClips: EditRoomNarrationClip[] = []; // 나레이션 배치 정보 (다중 라인 지원)
  const narrationBlobEntries: Array<{ fileName: string; blob: Blob }> = []; // ZIP 루트 복사용
  const missingSceneMedia: number[] = [];
  let videoCount = 0;
  let imageCount = 0;

  for (let i = 0; i < timeline.length; i++) {
    const t = timeline[i];
    const scene = scenes.find(s => s.id === t.sceneId);
    if (!scene) continue;

    const idx = String(i + 1).padStart(3, '0');
    let added = false;

    // 영상 우선 시도
    if (scene.videoUrl) {
      const blob = await fetchAssetBlob(scene.videoUrl);
      if (blob && blob.size > 0) {
        const fileName = `${idx}_scene.mp4`;
        zip.file(`media/${fileName}`, blob);
        mediaFileMap.set(i, fileName);
        mediaBlobMap.set(i, blob);
        videoCount++;
        added = true;
      }
      // 영상 다운로드 실패 → 이미지 폴백
    }

    if (!added && scene.imageUrl) {
      const originalBlob = await fetchAssetBlob(scene.imageUrl);
      if (originalBlob) {
        const blob = target === 'premiere'
          ? await normalizeStillImageBlobForPremiere(originalBlob, w, h)
          : originalBlob;
        const ext = getStillImageMime(blob) === 'image/png' ? 'png' : 'jpg';
        const fileName = `${idx}_scene.${ext}`;
        zip.file(`media/${fileName}`, blob);
        mediaFileMap.set(i, fileName);
        mediaBlobMap.set(i, blob);
        imageCount++;
        added = true;
      }
    }

    if (!added) {
      missingSceneMedia.push(i + 1);
    }
  }

  if (missingSceneMedia.length > 0) {
    const preview = missingSceneMedia.slice(0, 8).map((n) => `#${n}`).join(', ');
    const suffix = missingSceneMedia.length > 8 ? ' 외' : '';
    throw new Error(`내보낼 수 없는 장면이 있습니다: ${preview}${suffix}. 각 장면에 이미지나 영상을 준비한 뒤 다시 시도해주세요.`);
  }

  // 나레이션 오디오: sceneId 기준으로 모든 라인 수집(filter) + 순차 배치
  const narrationSortKey = (line: EditRoomNarrationLine): number => {
    if (typeof line.startTime === 'number' && Number.isFinite(line.startTime)) return line.startTime;
    if (typeof line.index === 'number' && Number.isFinite(line.index)) return line.index;
    return Number.POSITIVE_INFINITY;
  };
  const sceneOffsets = new Map<string, number>(); // 장면 내 순차 배치용 누적 오프셋(초)

  const resolveNarrationDuration = async (line: EditRoomNarrationLine, blob: Blob, fallbackSec: number): Promise<number> => {
    if (typeof line.duration === 'number' && Number.isFinite(line.duration) && line.duration > 0) {
      return line.duration;
    }
    const measured = await measureBlobAudioDuration(blob);
    if (typeof measured === 'number' && measured > 0) return measured;
    return Math.max(0.1, fallbackSec);
  };

  for (let i = 0; i < timeline.length; i++) {
    const t = timeline[i];
    const sceneNarrations = narrationLines
      .filter((line) => !!line.audioUrl && line.sceneId === t.sceneId)
      .sort((a, b) => narrationSortKey(a) - narrationSortKey(b));
    if (sceneNarrations.length === 0) continue;

    const idx = String(i + 1).padStart(3, '0');
    let seqInScene = 0;
    let sceneOffset = sceneOffsets.get(t.sceneId) || 0;

    for (const line of sceneNarrations) {
      const audioUrl = line.audioUrl;
      if (!audioUrl) continue;
      const blob = await fetchAssetBlob(audioUrl);
      if (!blob) continue;

      const durationSec = await resolveNarrationDuration(line, blob, t.imageDuration);
      const lineStart = typeof line.startTime === 'number' && Number.isFinite(line.startTime) && line.startTime >= 0
        ? line.startTime
        : t.imageStartTime + sceneOffset;
      const startSec = Math.max(0, lineStart);
      const localEndOffset = Math.max(0, (startSec - t.imageStartTime) + durationSec);
      sceneOffset = Math.max(sceneOffset, localEndOffset);

      seqInScene++;
      const narFileName = `${idx}_narration_${String(seqInScene).padStart(2, '0')}.mp3`;
      zip.file(`audio/${narFileName}`, blob);
      narrationBlobEntries.push({ fileName: narFileName, blob });
      narrationClips.push({ fileName: narFileName, startSec, durationSec });
    }

    sceneOffsets.set(t.sceneId, sceneOffset);
  }

  // sceneId가 없는 나레이션(예: mergedAudioUrl 폴백)도 전체 타임라인에 배치
  const unboundNarrations = narrationLines
    .filter((line) => !!line.audioUrl && !line.sceneId)
    .sort((a, b) => narrationSortKey(a) - narrationSortKey(b));
  let unboundOffset = 0;
  for (let i = 0; i < unboundNarrations.length; i++) {
    const line = unboundNarrations[i];
    const audioUrl = line.audioUrl;
    if (!audioUrl) continue;
    const blob = await fetchAssetBlob(audioUrl);
    if (!blob) continue;
    const durationSec = await resolveNarrationDuration(line, blob, timeline[0]?.imageDuration || 3);
    const startSec = typeof line.startTime === 'number' && Number.isFinite(line.startTime) && line.startTime >= 0
      ? line.startTime
      : unboundOffset;
    unboundOffset = Math.max(unboundOffset, startSec + durationSec);

    const narFileName = `global_narration_${String(i + 1).padStart(3, '0')}.mp3`;
    zip.file(`audio/${narFileName}`, blob);
    narrationBlobEntries.push({ fileName: narFileName, blob });
    narrationClips.push({ fileName: narFileName, startSec, durationSec });
  }

  narrationClips.sort((a, b) => a.startSec - b.startSec);

  // [FIX #472] FCP XML — mediaFileMap 전달하여 실제 파일명 기준으로 XML 생성
  // 나레이션은 line.duration/오디오 메타데이터 기반 실제 길이로 A2 트랙에 배치
  // VREW는 XML import 미지원 — premiere/capcut만 XML 포함
  if (target !== 'vrew') {
    const xml = buildEditRoomFcpXml({
      timeline,
      scenes,
      title,
      fps,
      width: w,
      height: h,
      mediaFileMap,
      narrationClips,
      stillImageScaleBase: target === 'premiere' ? OVERSCALE : 1,
    });
    zip.file(`${safeName}.xml`, xml);
  }

  // [FIX #610] CapCut projectId — README에서도 참조해야 하므로 블록 밖에서 생성
  const editRoomCapCutProjectId = target === 'capcut' ? uuid() : '';

  // CapCut 전용: draft_content.json (이미지+자막+나레이션 타임라인 자동 배치)
  if (target === 'capcut') {
    const totalDurUs = toUs(timeline[timeline.length - 1]?.imageEndTime || 0);
    const projectId = editRoomCapCutProjectId;
    const scaffoldIds: CapCutProjectScaffoldIds = {
      draftFolderId: projectId,
      draftId: uuid(),
      timelineId: uuid(),
      timelineProjectId: uuid(),
    };
    const speedId = uuid();
    const canvasId = uuid();
    const emptyArr: never[] = [];
    const platformInfo = buildCapCutPlatformInfo(detectCapCutDesktopPlatform());
    const trackVideoId = uuid();
    const trackTextId = uuid();
    const trackAudioId = uuid();

    for (const [i, fileName] of mediaFileMap.entries()) {
      const blob = mediaBlobMap.get(i);
      if (!blob) continue;
      const isVideo = fileName.endsWith('.mp4');
      zip.file(`${projectId}/materials/${isVideo ? 'video' : 'image'}/${fileName}`, blob);
    }
    for (const { fileName, blob } of narrationBlobEntries) {
      zip.file(`${projectId}/materials/audio/${fileName}`, blob);
    }

    // ── 미디어 머티리얼: 장면별 이미지/영상 (Map으로 인덱스 보존 — 미디어 누락 시 밀림 방지) ──
    const videoMaterialMap = new Map<number, { id: string; path: string; dur: number; isPhoto: boolean }>();
    const audioMaterialsWithStart: Array<{ id: string; path: string; dur: number; start: number }> = [];

    for (let i = 0; i < timeline.length; i++) {
      const fileName = mediaFileMap.get(i);
      if (!fileName) continue;
      const isVideo = fileName.endsWith('.mp4');
      videoMaterialMap.set(i, {
        id: uuid(),
        path: fileName,
        dur: toUs(timeline[i].imageDuration),
        isPhoto: !isVideo,
      });
    }

    const videoMaterials = [...videoMaterialMap.values()];
    for (const clip of narrationClips) {
      audioMaterialsWithStart.push({
        id: uuid(),
        path: clip.fileName,
        dur: toUs(clip.durationSec),
        start: toUs(clip.startSec),
      });
    }
    const audioMaterials = audioMaterialsWithStart.map(({ id, path, dur }) => ({ id, path, dur }));

    // ── 비디오 세그먼트 (메인 트랙) — Map lookup으로 정확한 인덱스 매칭 ──
    const rawVideoSegments: Array<Record<string, unknown> | null> = timeline.map((t, i) => {
      const mat = videoMaterialMap.get(i);
      if (!mat) return null;
      const motionTrack = mat.isPhoto ? compileNleMotionTrack(t, w, h, fps) : null;
      const clipSettings = buildCapCutClipSettings(motionTrack, w, h);
      const commonKeyframes = buildCapCutCommonKeyframes(motionTrack, w, h);
      return {
        ...buildCapCutSegmentShell({
          clip: clipSettings,
          commonKeyframes,
          enableAdjust: true,
          extraMaterialRefs: [speedId, canvasId],
          materialId: mat.id,
          renderIndex: 0,
          sourceDurationUs: toUs(t.imageDuration),
          sourceStartUs: 0,
          speed: 1.0,
          targetDurationUs: toUs(t.imageDuration),
          targetStartUs: toUs(t.imageStartTime),
          trackRenderIndex: 0,
        }),
        uniform_scale: { on: !(motionTrack?.scale.length), value: clipSettings.scale.x },
      };
    }).filter(Boolean) as Array<Record<string, unknown>>;
    const videoSegments = rawVideoSegments;

    // ── 텍스트 머티리얼 + 세그먼트 (자막 트랙) ──
    const textMaterials: { id: string; text: string; start: number; dur: number }[] = [];
    for (const t of timeline) {
      for (const seg of t.subtitleSegments) {
        if (!seg.text.trim()) continue;
        textMaterials.push({ id: uuid(), text: seg.text, start: toUs(seg.startTime), dur: toUs(seg.endTime - seg.startTime) });
      }
    }

    const textObjects = textMaterials.map(m => ({
      add_type: 0, alignment: 1, background_alpha: 0.0, background_color: '', background_height: 0.14,
      background_horizontal_offset: 0.0, background_round_radius: 0.0, background_style: 0,
      background_vertical_offset: 0.004, background_width: 0.14, bold_width: 0.0, border_alpha: 1.0,
      border_color: '', border_width: 0.08, check_flag: 7,
      content: JSON.stringify({ styles: [{ range: [0, m.text.length], size: 8.0, bold: true, italic: false, color: [1.0, 1.0, 1.0], useLetterColor: true }], text: m.text }),
      fixed_height: -1.0, fixed_width: -1.0, font_category_id: '', font_category_name: '', font_id: '',
      font_name: '', font_path: '', font_resource_id: '', font_size: 8.0, font_source_platform: 0,
      font_team_id: '', font_title: 'default', font_url: '', fonts: [],
      force_apply_line_max_width: false, global_alpha: 1.0, has_shadow: false, id: m.id,
      initial_scale: 1.0, inner_padding: -1.0, is_rich_text: false, italic_degree: 0,
      ktv_color: '', language: '', layer_weight: 1, letter_spacing: 0.0, line_feed: 1,
      line_max_width: 0.82, line_spacing: 0.02, multi_language_current: 'none', name: '',
      original_size: [], preset_category: '', preset_category_id: '', preset_has_set_alignment: false,
      preset_id: '', preset_index: 0, preset_name: '', recognize_task_id: '', recognize_type: 0,
      relevance_segment: [], shadow_alpha: 0.9, shadow_angle: -45.0, shadow_color: '',
      shadow_distance: 0.04, shadow_point: { x: 0.6363961031, y: -0.6363961031 },
      shadow_smoothing: 0.45, shape_clip_x: false, shape_clip_y: false, style_name: '',
      sub_type: 0, subtitle_keywords: null, subtitle_template_original_fontsize: 0.0,
      text_alpha: 1.0, text_color: '#FFFFFF', text_curve: null, text_preset_resource_id: '',
      text_size: 30, text_to_audio_ids: [], tts_auto_update: false, type: 'subtitle',
      typesetting: 0, underline: false, underline_offset: 0.22, underline_width: 0.05,
      use_effect_default_color: true, words: null,
    }));

    const textSegments = textMaterials.map(m => buildCapCutSegmentShell({
      clip: { alpha: 1.0, flip: { horizontal: false, vertical: false }, rotation: 0.0, scale: { x: 1.0, y: 1.0 }, transform: { x: 0.0, y: 0.0 } },
      commonKeyframes: emptyArr,
      enableAdjust: false,
      extraMaterialRefs: emptyArr,
      materialId: m.id,
      renderIndex: 11000,
      sourceDurationUs: m.dur,
      sourceStartUs: 0,
      speed: 1.0,
      targetDurationUs: m.dur,
      targetStartUs: m.start,
      trackRenderIndex: 11000,
    }));

    // ── 오디오 세그먼트 (나레이션 트랙) — 라인 단위 다중 배치 ──
    const audioSegments = audioMaterialsWithStart.map((aMat) => buildCapCutSegmentShell({
      clip: { alpha: 1.0, flip: { horizontal: false, vertical: false }, rotation: 0.0, scale: { x: 1.0, y: 1.0 }, transform: { x: 0.0, y: 0.0 } },
      commonKeyframes: emptyArr,
      enableAdjust: false,
      extraMaterialRefs: emptyArr,
      materialId: aMat.id,
      renderIndex: 0,
      sourceDurationUs: aMat.dur,
      sourceStartUs: 0,
      speed: 1.0,
      targetDurationUs: aMat.dur,
      targetStartUs: aMat.start,
      trackRenderIndex: 0,
    }));
    const keyValueEntries = [
      ...videoSegments.map((segment, index) => ({
        segmentId: String(segment['id'] || ''),
        materialName: videoMaterials[index]?.path || '',
      })).filter((entry) => entry.materialName),
      ...audioSegments.map((segment, index) => ({
        segmentId: String(segment['id'] || ''),
        materialName: audioMaterials[index]?.path || '',
      })).filter((entry) => entry.materialName),
    ];

    // ── draft_content.json 조립 ──
    const draft = {
      canvas_config: { background: '', height: h, ratio: 'original', width: w },
      color_space: 0,
      config: {
        adjust_max_index: 1, attachment_info: emptyArr, combination_max_index: 1,
        export_range: null, extract_audio_last_index: 1, lyrics_recognition_id: '',
        lyrics_sync: false, lyrics_taskinfo: emptyArr, maintrack_adsorb: true,
        material_save_mode: 0, original_sound_last_index: 1, record_audio_last_index: 1,
        sticker_max_index: 1, subtitle_keywords_config: null, subtitle_recognition_id: '',
        subtitle_sync: false, subtitle_taskinfo: emptyArr, system_font_list: emptyArr,
        video_mute: false, zoom_info_params: null,
      },
      cover: null,
      create_time: 0,
      draft_type: 'video',
      duration: totalDurUs,
      extra_info: null,
      function_assistant_info: {
        audio_noise_segid_list: emptyArr,
        auto_adjust: false,
        auto_adjust_fixed: false,
        auto_adjust_fixed_value: 0,
        auto_adjust_segid_list: emptyArr,
        auto_caption: false,
        auto_caption_segid_list: emptyArr,
        auto_caption_template_id: '',
        auto_lyrics: false,
        auto_lyrics_segid_list: emptyArr,
        auto_music: false,
        auto_music_segid_list: emptyArr,
        auto_speed: false,
        auto_speed_conf: '',
        auto_subtitle: false,
        auto_subtitle_segid_list: emptyArr,
        auto_video_beauty: false,
        auto_video_beauty_segid_list: emptyArr,
        beautify_body: false,
        beautify_face: false,
        enable_ai: false,
        remove_background: false,
        video_mosaic: false,
      },
      fps: fps,
      free_render_index_mode_on: false,
      group_container: null,
      id: scaffoldIds.timelineId,
      is_drop_frame_timecode: false,
      keyframe_graph_list: emptyArr,
      keyframes: { adjusts: emptyArr, audios: emptyArr, effects: emptyArr, filters: emptyArr, handwrites: emptyArr, stickers: emptyArr, texts: emptyArr, videos: emptyArr },
      last_modified_platform: platformInfo,
      lyrics_effects: emptyArr,
      materials: {
        ...buildCapCutEmptyMaterialBuckets(),
        audios: audioMaterials.map(m => ({
          ai_music_enter_from: '',
          ai_music_generate_scene: 0,
          ai_music_type: 0,
          aigc_history_id: '',
          aigc_item_id: '',
          app_id: 0,
          category_id: '',
          category_name: 'local',
          check_flag: 1,
          cloned_model_type: '',
          copyright_limit_type: 'none',
          duration: m.dur,
          effect_id: '',
          formula_id: '',
          id: m.id,
          intensifies_path: '',
          is_ai_clone_tone: false,
          is_ai_clone_tone_post: false,
          is_text_edit_overdub: false,
          is_ugc: false,
          local_material_id: '',
          lyric_type: 0,
          mock_tone_speaker: '',
          moyin_emotion: '',
          music_id: '',
          name: m.path.split('/').pop() || '',
          path: buildCapCutContainedMaterialPath(projectId, 'audio', m.path.split('/').pop() || ''),
          pgc_id: '',
          pgc_name: '',
          query: '',
          request_id: '',
          resource_id: '',
          search_id: '',
          similiar_music_info: { original_song_id: '', original_song_name: '' },
          sound_separate_type: '',
          source_from: '',
          source_platform: 0,
          team_id: '',
          text_id: '',
          third_resource_id: '',
          tone_category_id: '',
          tone_category_name: '',
          tone_effect_id: '',
          tone_effect_name: '',
          tone_emotion_name_key: '',
          tone_emotion_role: '',
          tone_emotion_scale: 0.0,
          tone_emotion_selection: '',
          tone_emotion_style: '',
          tone_platform: '',
          tone_second_category_id: '',
          tone_second_category_name: '',
          tone_speaker: '',
          tone_type: '',
          tts_benefit_info: { benefit_amount: -1, benefit_log_extra: '', benefit_log_id: '', benefit_type: 'none' },
          tts_generate_scene: '',
          tts_task_id: '',
          type: 'extract_music',
          unique_id: '',
          video_id: '',
          wave_points: [],
        })),
        canvases: [buildCapCutCanvasMaterial(canvasId)],
        drafts: emptyArr,
        effects: emptyArr,
        flowers: emptyArr,
        handwrites: emptyArr,
        head_animations: emptyArr,
        images: emptyArr,
        log_color_wheels: emptyArr,
        loudnesses: emptyArr,
        manual_deformations: emptyArr,
        material_animations: [buildCapCutMaterialAnimation(uuid())],
        material_colors: emptyArr,
        placeholders: emptyArr,
        plugin_effects: emptyArr, realtime_denoises: emptyArr, shapes: emptyArr,
        smart_crops: emptyArr, smart_relayouts: emptyArr,
        speeds: [{ curve_speed: null, id: speedId, mode: 0, name: '', speed: 1.0, type: 'speed' }],
        stickers: emptyArr, tail_animations: emptyArr, text_templates: emptyArr,
        texts: textObjects,
        transitions: emptyArr, video_effects: emptyArr, video_trackings: emptyArr,
        videos: videoMaterials.map(m => ({
          aigc_history_id: '',
          aigc_item_id: '',
          aigc_type: 'none',
          audio_fade: null,
          beauty_body_auto_preset: null,
          beauty_body_preset_id: '',
          beauty_face_auto_preset: { name: '', preset_id: '', rate_map: '', scene: '' },
          beauty_face_auto_preset_infos: [],
          beauty_face_preset_infos: [],
          cartoon_path: '',
          category_id: '',
          category_name: '',
          check_flag: 62978047,
          content_feature_info: null,
          corner_pin: null,
          crop: { lower_left_x: 0, lower_left_y: 1, lower_right_x: 1, lower_right_y: 1, upper_left_x: 0, upper_left_y: 0, upper_right_x: 1, upper_right_y: 0 },
          crop_ratio: 'free', crop_scale: 1.0,
          duration: m.dur, extra_type_option: 0, formula_id: '', freeze: null,
          has_audio: !m.isPhoto,
          has_sound_separated: false,
          height: h,
          id: m.id,
          intensifies_audio_path: '', intensifies_path: '', is_ai_generate_content: false,
          is_copyright: false, is_text_edit_overdub: false, is_unified_beauty_mode: false,
          live_photo_cover_path: '',
          live_photo_timestamp: -1,
          local_id: '',
          local_material_from: '',
          local_material_id: '',
          material_id: '',
          material_name: m.path.split('/').pop() || '',
          material_url: '',
          matting: {
            custom_matting_id: '',
            enable_matting_stroke: false,
            expansion: 0,
            feather: 0,
            flag: 0,
            has_use_quick_brush: false,
            has_use_quick_eraser: false,
            interactiveTime: [],
            path: '',
            reverse: false,
            strokes: [],
          },
          media_path: '',
          music_id: '',
          multi_camera_info: null,
          object_locked: null,
          origin_material_id: '',
          path: buildCapCutContainedMaterialPath(projectId, m.isPhoto ? 'image' : 'video', m.path.split('/').pop() || ''),
          picture_from: m.isPhoto ? 'default' : 'none',
          picture_set_category_id: '',
          picture_set_category_name: '',
          request_id: '',
          reverse_intensifies_path: '',
          reverse_path: '',
          smart_match_info: null,
          smart_motion: null,
          source: 0,
          source_platform: 0,
          stable: {
            matrix_path: '',
            stable_level: 0,
            time_range: { duration: 0, start: 0 },
          },
          surface_trackings: [],
          team_id: '',
          type: m.isPhoto ? 'photo' : 'video',
          unique_id: '',
          video_algorithm: {
            ai_background_configs: [],
            ai_expression_driven: null,
            ai_in_painting_config: [],
            ai_motion_driven: null,
            aigc_generate: null,
            aigc_generate_list: [],
            algorithms: [],
            complement_frame_config: null,
            deflicker: null,
            gameplay_configs: [],
            image_interpretation: null,
            motion_blur_config: null,
            mouth_shape_driver: null,
            noise_reduction: null,
            path: '',
            quality_enhance: null,
            skip_algorithm_index: [],
            smart_complement_frame: null,
            story_video_modify_video_config: { is_overwrite_last_video: false, task_id: '', tracker_task_id: '' },
            super_resolution: null,
            time_range: { duration: 0, start: 0 },
          },
          video_mask_shadow: { alpha: 0.0, angle: 0.0, blur: 0.0, color: '', distance: 0.0, path: '', resource_id: '' },
          video_mask_stroke: {
            alpha: 0.0,
            color: '',
            distance: 0.0,
            horizontal_shift: 0.0,
            path: '',
            resource_id: '',
            size: 0.0,
            texture: 0.0,
            type: '',
            vertical_shift: 0.0,
          },
          width: w,
        })),
      },
      mutable_config: null,
      name: '',
      new_version: '163.0.0',
      path: '',
      platform: platformInfo,
      relationships: emptyArr,
      render_index_track_mode_on: true,
      retouch_cover: null,
      smart_ads_info: { draft_url: '', page_from: '', routine: '' },
      source: 'default',
      static_cover_image_path: '',
      time_marks: null,
      tracks: [
        { attribute: 0, flag: 0, id: trackVideoId, is_default_name: true, name: '', segments: videoSegments, type: 'video' },
        ...(textSegments.length > 0 ? [{ attribute: 0, flag: 0, id: trackTextId, is_default_name: true, name: '', segments: textSegments, type: 'text' }] : []),
        ...(audioSegments.length > 0 ? [{ attribute: 0, flag: 0, id: trackAudioId, is_default_name: true, name: '', segments: audioSegments, type: 'audio' }] : []),
      ],
      uneven_animation_template_info: { composition: '', content: '', order: '', sub_template_info_list: emptyArr },
      update_time: 0,
      version: 360000,
    };

    const draftJson = JSON.stringify(draft);
    const editNowTs = Math.floor(Date.now() / 1000);
    const editNowUs = Date.now() * 1000;
    const draftTimelineMaterialsSize = videoMaterials.length + textObjects.length + audioMaterials.length;
    const draftCoverBlob = await buildCapCutDraftCoverBlob(w, h);
    const attachmentPcTimelineJson = buildCapCutAttachmentPcTimeline();
    const attachmentScriptVideoJson = buildCapCutAttachmentScriptVideo();
    const attachmentActionSceneJson = buildCapCutAttachmentActionScene();
    const attachmentPcCommonJson = buildCapCutAttachmentPcCommon();
    const attachmentEditingJson = buildCapCutAttachmentEditing();
    const draftExtra = buildCapCutOpaqueDraftExtra();
    zip.file(`${projectId}/draft_content.json`, draftJson);
    zip.file(`${projectId}/draft_settings`, buildCapCutDraftSettings(editNowTs, w, h, detectCapCutDesktopPlatform(), draftTimelineMaterialsSize, totalDurUs / 1_000_000));
    zip.file(`${projectId}/draft_info.json`, draftJson);
    zip.file(`${projectId}/draft_meta_info.json`, buildCapCutDraftMetaInfo({
      draftFolderId: projectId,
      draftId: scaffoldIds.draftId,
      title,
      tmDuration: totalDurUs,
      tmDraftModifiedUs: editNowUs,
      draftTimelineMaterialsSize,
    }));
    zip.file(`${projectId}/Timelines/project.json`, buildCapCutTimelineProject(scaffoldIds.timelineProjectId, scaffoldIds.timelineId, editNowUs));
    zip.file(`${projectId}/common_attachment/attachment_pc_timeline.json`, attachmentPcTimelineJson);
    zip.file(`${projectId}/common_attachment/attachment_script_video.json`, attachmentScriptVideoJson);
    zip.file(`${projectId}/common_attachment/attachment_action_scene.json`, attachmentActionSceneJson);
    zip.file(`${projectId}/common_attachment/coperate_create.json`, buildCapCutCooperateCreate());
    zip.file(`${projectId}/attachment_pc_common.json`, attachmentPcCommonJson);
    zip.file(`${projectId}/attachment_editing.json`, attachmentEditingJson);
    zip.file(`${projectId}/timeline_layout.json`, buildCapCutTimelineLayout(scaffoldIds.timelineId));
    zip.file(`${projectId}/draft_virtual_store.json`, buildCapCutDraftVirtualStore());
    zip.file(`${projectId}/key_value.json`, buildCapCutKeyValue(keyValueEntries));
    zip.file(`${projectId}/draft_biz_config.json`, buildCapCutDraftBizConfig(scaffoldIds.timelineId, [trackVideoId, ...(textSegments.length > 0 ? [trackTextId] : []), ...(audioSegments.length > 0 ? [trackAudioId] : [])]));
    zip.file(`${projectId}/draft_agency_config.json`, buildCapCutDraftAgencyConfig());
    zip.file(`${projectId}/performance_opt_info.json`, buildCapCutPerformanceOptInfo());
    zip.file(`${projectId}/draft.extra`, draftExtra);
    zip.file(`${projectId}/crypto_key_store.dat`, buildCapCutOpaqueCryptoKeyStore());
    zip.file(`${projectId}/draft_cover.jpg`, draftCoverBlob);
    addCapCutDesktopInstallerFiles({
      zip,
      projectFolderId: projectId,
    });
    addCapCutMainTimelineMirror({
      zip,
      projectFolderId: projectId,
      mainTimelineId: scaffoldIds.timelineId,
      draftJson,
      attachmentPcCommonJson,
      attachmentEditingJson,
      attachmentPcTimelineJson,
      attachmentScriptVideoJson,
      attachmentActionSceneJson,
      draftExtra,
      draftCover: draftCoverBlob,
    });
  }

  // README (CapCut은 SRT import 가장 안정적이라 SRT 중심으로 안내)
  if (target === 'premiere') {
    zip.file('README.txt', [
      `=== ${title} — Premiere Pro / DaVinci Resolve ===`,
      '',
      '[ 가져오기 ]',
      '1. ZIP을 원하는 위치에 압축 해제하세요.',
      '2. Premiere Pro > File > Import (Ctrl+I)',
      `3. "${safeName}.xml" 선택 → 타임라인 자동 생성`,
      '4. media/ 폴더의 이미지/영상이 자동 연결됩니다.',
      '',
      '[ 자막 ]',
      `• "${safeName}_자막.srt" → Captions 트랙으로 가져올 수 있습니다.`,
      '',
      '[ 나레이션 ]',
      narrationClips.length > 0
        ? `• 나레이션 ${narrationClips.length}개가 A2 오디오 트랙에 자동 배치됩니다.`
        : '• audio/ 폴더의 나레이션 MP3를 오디오 트랙에 배치하세요.',
      '',
      `• ${timeline.length}개 장면 · ${w}x${h} · ${fps}fps`,
      videoCount > 0 || imageCount > 0
        ? `• 미디어 구성: 영상 ${videoCount}개 + 이미지 ${imageCount}개`
        : '',
    ].filter(Boolean).join('\n'));
  } else if (target === 'capcut') {
    zip.file('README.txt', [
      `=== ${title} — CapCut 프로젝트 파일 ===`,
      '',
      '★ 추천: 설치 스크립트 실행 (이미지/영상 + 자막 + 나레이션 자동 연결)',
      '1. CapCut 데스크톱을 완전히 종료합니다.',
      '2. ZIP 압축을 해제합니다.',
      `3. Mac은 "${CAPCUT_MAC_INSTALLER_NAME}", Windows는 "${CAPCUT_WINDOWS_BATCH_INSTALLER_NAME}"를 실행합니다.`,
      `4. 스크립트가 "${editRoomCapCutProjectId}" 폴더를 CapCut 프로젝트 경로에 복사하고 media path를 현재 PC 절대경로로 맞춥니다.`,
      '5. 설치가 끝나면 CapCut에서 프로젝트 카드를 열면 됩니다.',
      '6. 이미지/영상, 자막, 나레이션이 모두 타임라인에 배치되어 있습니다.',
      '',
      '[ 수동 복사만 하면 안 되는 이유 ]',
      '• 최신 CapCut 데스크톱은 imported draft의 media path를 상대경로로 둘 경우 Media Not Found가 날 수 있습니다.',
      '• 설치 스크립트가 그 경로를 현재 PC 기준 절대경로로 바꿔줍니다.',
      '',
      '[ 대안 1: SRT 자막 가져오기 ]',
      '1. CapCut에서 새 프로젝트 생성 후 media/ 이미지를 타임라인에 배치',
      `2. 자막 > 자막 가져오기 > "${safeName}_자막.srt" 선택`,
      '',
      '[ 대안 2: XML 가져오기 ]',
      `• File > Import > XML File > "${safeName}.xml"`,
      '',
      `• ${timeline.length}개 장면 · ${w}x${h} · ${fps}fps`,
      videoCount > 0 || imageCount > 0
        ? `• 미디어 구성: 영상 ${videoCount}개 + 이미지 ${imageCount}개`
        : '',
      narrationClips.length > 0
        ? `• 나레이션 ${narrationClips.length}개 자동 배치`
        : '',
    ].filter(Boolean).join('\n'));
  } else {
    // VREW — SRT 자막 중심 (VREW는 XML import 미지원)
    zip.file('README.txt', [
      `=== ${title} — VREW ===`,
      '',
      '[ 사용법 ]',
      '1. VREW를 열고 media/ 폴더의 영상/이미지를 불러옵니다.',
      `2. 자막 > 자막 파일 불러오기 > "${safeName}_자막.srt" 선택`,
      '3. 자막이 타임라인에 자동 배치됩니다.',
      narrationClips.length > 0
        ? `4. audio/ 폴더의 나레이션 MP3(${narrationClips.length}개)를 오디오 트랙에 수동 배치하세요.`
        : null,
      '',
      `• ${timeline.length}개 장면 · ${w}x${h} · ${fps}fps`,
      videoCount > 0 || imageCount > 0
        ? `• 미디어 구성: 영상 ${videoCount}개 + 이미지 ${imageCount}개`
        : '',
    ].filter(Boolean).join('\n'));
  }

  const blob = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE', compressionOptions: { level: 6 } });
  return { blob, videoCount, imageCount, totalScenes: timeline.length };
}
