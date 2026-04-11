/**
 * Premiere Pro 2024 호환성 회귀 테스트
 *
 * 목적: 빌드된 .prproj XML이 진짜 v43 형식인지, 미디어 링크 체인이 무결한지 검증.
 * - Project Version="43"
 * - BuildVersion=24.x
 * - FilePath=./videoname.mp4 상대경로
 * - 절대경로(/Users/, C:\Users\) 0건
 * - ImporterPrefs 노드 존재
 * - AudioStream 존재 (hasAudioTrack=true)
 * - Media → MasterClip → SubClip → TimelineClip → VideoMediaSource 체인 무결성
 *
 * 관련 이슈: #1056 #1054 #1048 #1047 #995 #969 #968
 *
 * 환경: node + @xmldom/xmldom 폴리필 (jsdom의 ESM/TLA 호환 문제 회피)
 */
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';

import JSZip from 'jszip';
import * as linkedom from 'linkedom';
import { describe, expect, it, vi } from 'vitest';
import { monitoredFetch } from '../apiService';

vi.mock('../apiService', () => ({
  monitoredFetch: vi.fn(),
}));

vi.mock('../evolinkService', () => ({
  evolinkChat: vi.fn(),
}));

vi.mock('../ytdlpApiService', () => ({
  isCompanionDetected: vi.fn(() => false),
}));

vi.mock('../youtubeReferenceService', () => ({
  downloadAndTrimReferenceClip: vi.fn(),
  isReferenceClipCompatibilityErrorMessage: vi.fn(() => false),
}));

// nleExportService.ts는 브라우저 DOM API(DOMParser, XMLSerializer, querySelector, Element 등)를 사용하므로
// linkedom으로 글로벌 폴리필을 주입한다.
// linkedom은 XMLSerializer를 export하지 않으므로 toString() 기반으로 직접 구현한다.
class LinkedomXMLSerializer {
  serializeToString(node: { toString(): string }): string {
    return node.toString();
  }
}
{
  const g = globalThis as unknown as Record<string, unknown>;
  g.DOMParser = linkedom.DOMParser;
  g.XMLSerializer = LinkedomXMLSerializer;
  g.Node = linkedom.Node;
  g.Element = linkedom.Element;
  g.HTMLElement = linkedom.HTMLElement;
  g.Document = linkedom.Document;
}

const LEGACY_TEMPLATE_XML = gunzipSync(
  readFileSync(new URL('../../assets/premiere-native-template.prproj', import.meta.url)),
).toString('utf8');

const PREMIERE_TICKS_PER_SECOND = 127_008_000_000;

function parseXml(xml: string): Document {
  return new linkedom.DOMParser().parseFromString(xml, 'text/xml') as unknown as Document;
}

function getDirectChild(parent: Element, tagName: string): Element | null {
  return Array.from(parent.children).find((child) => child.tagName === tagName) ?? null;
}

function getChildText(parent: Element, tagName: string): string {
  return (getDirectChild(parent, tagName)?.textContent || '').trim();
}

function getPremiereCaptionTrackNodes(doc: Document): Element[] {
  return Array.from(doc.getElementsByTagName('CaptionDataClipTrack'))
    .map((track) => getDirectChild(getDirectChild(track, 'DataClipTrack')!, 'ClipTrack'))
    .map((clipTrack) => clipTrack ? getDirectChild(clipTrack, 'Track') : null)
    .filter((track): track is Element => !!track);
}

function buildSingleScene() {
  return [
    {
      cutNum: 1,
      timeline: '1',
      sourceTimeline: '00:00~00:01',
      dialogue: '첫 장면',
      effectSub: '',
      sceneDesc: '도입부',
      mode: 'storyboard',
      audioContent: '첫 장면',
      duration: '1초',
      videoDirection: '고정 샷',
      timecodeSource: '00:00~00:01',
    },
  ];
}

describe('buildPremiereNativeProjectXml — Premiere 2024 호환성', () => {
  it('exports the Premiere XML builder', async () => {
    const { buildPremiereNativeProjectXml } = await import('../nleExportService');
    expect(typeof buildPremiereNativeProjectXml).toBe('function');
  });

  it('생성된 XML이 진짜 v43 호환 Premiere 프로젝트인지 검증', async () => {
    const { buildPremiereNativeProjectXml } = await import('../nleExportService');
    const xml = await buildPremiereNativeProjectXml({
      scenes: [
        {
          cutNum: 1,
          timeline: '1',
          sourceTimeline: '00:00~00:03',
          dialogue: '프리미어 호환성 검증 자막입니다.',
          effectSub: '팡',
          sceneDesc: '도시 전경',
          mode: 'storyboard',
          audioContent: '프리미어 호환성 검증 자막입니다.',
          duration: '3초',
          videoDirection: '고정 샷',
          timecodeSource: '00:00~00:03',
        },
      ],
      title: 'Premiere 2024 Compatibility',
      videoFileName: 'sample-video.mp4',
      width: 1080,
      height: 1920,
      fps: 30,
      videoDurationSec: 3,
      hasAudioTrack: true,
      templateXmlOverride: LEGACY_TEMPLATE_XML,
      prototypeTemplateXmlOverride: LEGACY_TEMPLATE_XML,
    });

    const doc = parseXml(xml);
    const rootObjects = Array.from(doc.documentElement.children);
    const project = rootObjects.find((el) => el.getAttribute('ObjectID') === '1') ?? null;
    expect(project).not.toBeNull();
    expect(project!.tagName).toBe('Project');

    // ── 검증 1: Project Version="43" (2024 호환) ──
    expect(project!.getAttribute('Version')).toBe('43');

    // ── 검증 2: BuildVersion이 24.x (2024 형식) ──
    const buildVersionElems = [
      ...Array.from(doc.getElementsByTagName('MZ.BuildVersion.Created')),
      ...Array.from(doc.getElementsByTagName('MZ.BuildVersion.Modified')),
    ];
    expect(buildVersionElems.length).toBeGreaterThan(0);
    buildVersionElems.forEach((el) => {
      const text = (el.textContent || '').trim();
      expect(text).toMatch(/^24\./);
    });

    // ── 검증 3: FilePath가 ./sample-video.mp4 상대경로 ──
    const filePaths = Array.from(doc.getElementsByTagName('FilePath')).map(
      (el) => (el.textContent || '').trim(),
    );
    expect(filePaths).toContain('./sample-video.mp4');

    // ── 검증 4: 절대경로(/Users/, C:\Users\) 0건 ──
    expect(/\/Users\/|[A-Z]:\\Users\\/.test(xml)).toBe(false);

    // ── 검증 5: 소스 미디어 노드 + ImporterPrefs + AudioStream 존재 ──
    const sourceMedia = rootObjects.find((el) =>
      el.tagName === 'Media' && getChildText(el, 'FilePath') === './sample-video.mp4',
    ) ?? null;
    expect(sourceMedia).not.toBeNull();
    expect(getDirectChild(sourceMedia!, 'ImporterPrefs')).not.toBeNull();
    expect(getDirectChild(sourceMedia!, 'AudioStream')).not.toBeNull();

    // ── 검증 6: Media → MasterClip → SubClip → TimelineClip → VideoMediaSource 체인 무결성 ──
    const sourceMediaUid = sourceMedia!.getAttribute('ObjectUID') || '';
    expect(sourceMediaUid).not.toBe('');

    const sourceVideoMediaSource = rootObjects.find((el) => {
      if (el.tagName !== 'VideoMediaSource') return false;
      const mediaSource = getDirectChild(el, 'MediaSource');
      const mediaRef = mediaSource ? getDirectChild(mediaSource, 'Media') : null;
      return mediaRef?.getAttribute('ObjectURef') === sourceMediaUid;
    }) ?? null;
    expect(sourceVideoMediaSource).not.toBeNull();

    const sourceMasterClip = rootObjects.find((el) =>
      el.tagName === 'MasterClip' && getChildText(el, 'Name') === 'sample-video.mp4',
    ) ?? null;
    expect(sourceMasterClip).not.toBeNull();
    const sourceMasterClipUid = sourceMasterClip!.getAttribute('ObjectUID') || '';
    expect(sourceMasterClipUid).not.toBe('');

    const sourceSubClip = rootObjects.find((el) =>
      el.tagName === 'SubClip'
      && getChildText(el, 'Name') === 'sample-video.mp4'
      && getDirectChild(el, 'MasterClip')?.getAttribute('ObjectURef') === sourceMasterClipUid,
    ) ?? null;
    expect(sourceSubClip).not.toBeNull();

    const timelineVideoClipId = getDirectChild(sourceSubClip!, 'Clip')?.getAttribute('ObjectRef') || '';
    expect(timelineVideoClipId).not.toBe('');

    const timelineVideoClip = rootObjects.find((el) => el.getAttribute('ObjectID') === timelineVideoClipId) ?? null;
    expect(timelineVideoClip).not.toBeNull();

    const timelineClipBody = getDirectChild(timelineVideoClip!, 'Clip');
    expect(timelineClipBody).not.toBeNull();

    // 타임라인 클립의 Source가 sourceVideoMediaSource를 가리키는지 (체인의 핵심)
    const timelineSourceRef = getDirectChild(timelineClipBody!, 'Source')?.getAttribute('ObjectRef') || '';
    const sourceVideoMediaSourceId = sourceVideoMediaSource!.getAttribute('ObjectID') || '';
    expect(timelineSourceRef).toBe(sourceVideoMediaSourceId);
  }, 30_000);

  it('hasAudioTrack=false 영상은 AudioStream 노드가 제거됨', async () => {
    const { buildPremiereNativeProjectXml } = await import('../nleExportService');
    const xml = await buildPremiereNativeProjectXml({
      scenes: [
        {
          cutNum: 1,
          timeline: '1',
          sourceTimeline: '00:00~00:03',
          dialogue: '무음 영상 자막입니다.',
          effectSub: '팡',
          sceneDesc: '풍경',
          mode: 'storyboard',
          audioContent: '무음 영상 자막입니다.',
          duration: '3초',
          videoDirection: '고정 샷',
          timecodeSource: '00:00~00:03',
        },
      ],
      title: 'Video Only',
      videoFileName: 'silent-video.mp4',
      width: 1080,
      height: 1920,
      fps: 30,
      videoDurationSec: 3,
      hasAudioTrack: false,
      templateXmlOverride: LEGACY_TEMPLATE_XML,
      prototypeTemplateXmlOverride: LEGACY_TEMPLATE_XML,
    });

    const doc = parseXml(xml);
    const rootObjects = Array.from(doc.documentElement.children);
    const sourceMedia = rootObjects.find((el) =>
      el.tagName === 'Media' && getChildText(el, 'FilePath') === './silent-video.mp4',
    ) ?? null;
    expect(sourceMedia).not.toBeNull();
    expect(getDirectChild(sourceMedia!, 'AudioStream')).toBeNull();
  }, 30_000);

  it('동일한 effect subtitle은 중복 생성하지 않고 caption track 잠금을 해제한다', async () => {
    const { buildPremiereNativeProjectXml } = await import('../nleExportService');
    const xml = await buildPremiereNativeProjectXml({
      scenes: [
        {
          cutNum: 1,
          timeline: '1',
          sourceTimeline: '00:00~00:03',
          dialogue: '같은 자막',
          effectSub: '같은 자막',
          sceneDesc: '중복 제거',
          mode: 'storyboard',
          audioContent: '같은 자막',
          duration: '3초',
          videoDirection: '고정 샷',
          timecodeSource: '00:00~00:03',
        },
      ],
      title: 'Premiere Caption Dedupe',
      videoFileName: 'duplicate-caption.mp4',
      width: 1080,
      height: 1920,
      fps: 30,
      videoDurationSec: 3,
      hasAudioTrack: true,
      templateXmlOverride: LEGACY_TEMPLATE_XML,
      prototypeTemplateXmlOverride: LEGACY_TEMPLATE_XML,
    });

    const doc = parseXml(xml);
    const captionTrackNodes = getPremiereCaptionTrackNodes(doc);

    expect(captionTrackNodes).toHaveLength(1);
    expect(getChildText(captionTrackNodes[0], 'IsLocked')).toBe('false');
    expect(getChildText(captionTrackNodes[0], 'IsSyncLocked')).toBe('false');
    expect(Array.from(doc.getElementsByTagName('CaptionDataClipTrackItem'))).toHaveLength(1);
  }, 30_000);
});

describe('nleExportService timeline regressions', () => {
  it('FCP XML은 dialogue와 동일한 effect subtitle을 V3에 만들지 않고 subtitle track을 unlock 상태로 둔다', async () => {
    const { generateFcpXml } = await import('../nleExportService');
    const xml = generateFcpXml({
      scenes: [
        {
          cutNum: 1,
          timeline: '1',
          sourceTimeline: '00:00~00:03',
          dialogue: '같은 자막',
          effectSub: '같은 자막',
          sceneDesc: '중복 제거',
          mode: 'storyboard',
          audioContent: '같은 자막',
          duration: '3초',
          videoDirection: '고정 샷',
          timecodeSource: '00:00~00:03',
        },
      ],
      title: 'FCP Subtitle Dedupe',
      videoFileName: 'video.mp4',
      fps: 30,
      width: 1080,
      height: 1920,
      videoDurationSec: 3,
      flatMediaPaths: true,
    });

    expect(xml).toContain('<generatoritem id="sub-1">');
    expect(xml).not.toContain('<generatoritem id="fx-1">');
    expect(xml).toContain('<locked>FALSE</locked>');
  });

  it('FCP XML은 null placeholder effect subtitle을 건너뛴다', async () => {
    const { generateFcpXml } = await import('../nleExportService');
    const xml = generateFcpXml({
      scenes: [
        {
          cutNum: 1,
          timeline: '1',
          sourceTimeline: '00:00~00:03',
          dialogue: '일반 자막',
          effectSub: 'null',
          sceneDesc: 'placeholder 제거',
          mode: 'storyboard',
          audioContent: '일반 자막',
          duration: '3초',
          videoDirection: '고정 샷',
          timecodeSource: '00:00~00:03',
        },
      ],
      title: 'FCP Effect Placeholder Skip',
      videoFileName: 'video.mp4',
      fps: 30,
      width: 1080,
      height: 1920,
      videoDurationSec: 3,
      flatMediaPaths: true,
    });

    expect(xml).toContain('<generatoritem id="sub-1">');
    expect(xml).not.toContain('<generatoritem id="fx-1">');
  });

  it('FCP XML sequence duration tracks the farthest narration clip and keeps relative pathurls', async () => {
    const { generateFcpXml } = await import('../nleExportService');
    const xml = generateFcpXml({
      scenes: buildSingleScene(),
      title: 'Narration Tail Regression',
      videoFileName: 'video.mp4',
      fps: 30,
      width: 1080,
      height: 1920,
      videoDurationSec: 1,
      flatMediaPaths: true,
      narrationLines: [
        { audioFileName: '001_narration.mp3', duration: 1, startTime: 0, endTime: 1, text: '첫 줄' },
        { audioFileName: '002_narration.mp3', duration: 1, startTime: 3, endTime: 4, text: '추가 줄' },
      ],
    });

    const durationMatch = xml.match(/<sequence>\s*<name>[\s\S]*?<duration>(\d+)<\/duration>/);
    const sequenceDuration = Number(durationMatch?.[1] || '0');
    const endFrames = Array.from(xml.matchAll(/<end>(\d+)<\/end>/g)).map((match) => Number(match[1]));

    expect(sequenceDuration).toBe(120);
    expect(Math.max(...endFrames)).toBe(120);
    expect(xml).toContain('<pathurl>./video.mp4</pathurl>');
    expect(xml).toContain('<pathurl>./002_narration.mp3</pathurl>');
  });

  it('Premiere native project out point expands to the farthest narration clip', async () => {
    const { buildPremiereNativeProjectXml } = await import('../nleExportService');
    const xml = await buildPremiereNativeProjectXml({
      scenes: buildSingleScene(),
      title: 'Narration Tail Native',
      videoFileName: 'video.mp4',
      width: 1080,
      height: 1920,
      fps: 30,
      videoDurationSec: 1,
      hasAudioTrack: true,
      narrationLines: [
        { audioFileName: '001_narration.mp3', duration: 1, startTime: 0, endTime: 1, text: '첫 줄' },
        { audioFileName: '002_narration.mp3', duration: 1, startTime: 3, endTime: 4, text: '추가 줄' },
      ],
      templateXmlOverride: LEGACY_TEMPLATE_XML,
      prototypeTemplateXmlOverride: LEGACY_TEMPLATE_XML,
    });

    const outPointMatch = xml.match(/<MZ\.OutPoint>(\d+)<\/MZ\.OutPoint>/);
    const workOutPointMatch = xml.match(/<MZ\.WorkOutPoint>(\d+)<\/MZ\.WorkOutPoint>/);
    const expectedTicks = String(PREMIERE_TICKS_PER_SECOND * 4);

    expect(outPointMatch?.[1]).toBe(expectedTicks);
    expect(workOutPointMatch?.[1]).toBe(expectedTicks);
    expect(xml).toContain('<FilePath>./002_narration.mp3</FilePath>');
  }, 30_000);

  it('Edit Room FCP XML export keeps media at ZIP root and pathurls relative', async () => {
    const { buildEditRoomNleZip } = await import('../nleExportService');
    const result = await buildEditRoomNleZip({
      target: 'premiere',
      timeline: [{
        sceneId: 'scene-1',
        sceneIndex: 0,
        imageStartTime: 0,
        imageEndTime: 2,
        imageDuration: 2,
        subtitleSegments: [],
        effectPreset: '',
        volume: 1,
        speed: 1,
      }],
      scenes: [{
        id: 'scene-1',
        imageUrl: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO7ZQn8AAAAASUVORK5CYII=',
        scriptText: '첫 장면',
      }],
      narrationLines: [{
        sceneId: 'scene-1',
        audioUrl: 'data:audio/wav;base64,AAAA',
        duration: 1,
        startTime: 0.5,
      }],
      title: 'Edit Room Relative Path',
      aspectRatio: '9:16',
      fps: 30,
    });

    const zip = await JSZip.loadAsync(await result.blob.arrayBuffer());
    const fileNames = Object.keys(zip.files);
    const xmlEntryName = fileNames.find((name) => name.endsWith('.xml'));
    const xml = xmlEntryName ? (await zip.file(xmlEntryName)?.async('string')) || '' : '';
    const pathurls = Array.from(xml.matchAll(/<pathurl>([^<]+)<\/pathurl>/g)).map((match) => match[1]);

    expect(fileNames).toContain('001_scene.png');
    expect(fileNames).toContain('001_narration_01.wav');
    expect(fileNames).not.toContain('media/001_scene.png');
    expect(fileNames).not.toContain('audio/001_narration_01.wav');
    expect(pathurls).toEqual(expect.arrayContaining([
      './001_scene.png',
      './001_narration_01.wav',
    ]));
    expect(pathurls.every((value) => value.startsWith('./'))).toBe(true);
    expect(pathurls.some((value) => /^\.\/(?:media|audio)\//.test(value))).toBe(false);
  });

  it('Edit Room ZIP adds scene and narration blobs without calling blob.arrayBuffer', async () => {
    const { buildEditRoomNleZip } = await import('../nleExportService');
    const sceneBlob = new Blob(['scene-video'], { type: 'video/mp4' });
    const narrationBlob = new Blob(['narration-audio'], { type: 'audio/wav' });
    const sceneArrayBufferSpy = vi.spyOn(sceneBlob, 'arrayBuffer');
    const narrationArrayBufferSpy = vi.spyOn(narrationBlob, 'arrayBuffer');

    vi.mocked(monitoredFetch).mockImplementation(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url === 'blob:scene-video') {
        return {
          ok: true,
          blob: async () => sceneBlob,
        } as Response;
      }
      if (url === 'blob:narration-audio') {
        return {
          ok: true,
          blob: async () => narrationBlob,
        } as Response;
      }
      throw new Error(`Unexpected monitoredFetch URL: ${url}`);
    });

    try {
      const result = await buildEditRoomNleZip({
        target: 'premiere',
        timeline: [{
          sceneId: 'scene-1',
          sceneIndex: 0,
          imageStartTime: 0,
          imageEndTime: 2,
          imageDuration: 2,
          subtitleSegments: [],
          effectPreset: '',
          volume: 1,
          speed: 1,
        }],
        scenes: [{
          id: 'scene-1',
          videoUrl: 'blob:scene-video',
          scriptText: '직접 Blob ZIP',
        }],
        narrationLines: [{
          sceneId: 'scene-1',
          audioUrl: 'blob:narration-audio',
          duration: 1,
          startTime: 0.25,
        }],
        title: 'Edit Room Blob Direct',
        aspectRatio: '9:16',
        fps: 30,
      });

      const zip = await JSZip.loadAsync(await result.blob.arrayBuffer());
      const fileNames = Object.keys(zip.files);

      expect(fileNames).toEqual(expect.arrayContaining([
        '001_scene.mp4',
        '001_narration_01.wav',
      ]));
      expect(sceneArrayBufferSpy).not.toHaveBeenCalled();
      expect(narrationArrayBufferSpy).not.toHaveBeenCalled();
    } finally {
      vi.mocked(monitoredFetch).mockReset();
      sceneArrayBufferSpy.mockRestore();
      narrationArrayBufferSpy.mockRestore();
    }
  });

  it('Edit Room FCP XML sequence duration expands to the farthest narration clip', async () => {
    const { buildEditRoomNleZip } = await import('../nleExportService');
    const result = await buildEditRoomNleZip({
      target: 'premiere',
      timeline: [{
        sceneId: 'scene-1',
        sceneIndex: 0,
        imageStartTime: 0,
        imageEndTime: 2,
        imageDuration: 2,
        subtitleSegments: [],
        effectPreset: '',
        volume: 1,
        speed: 1,
      }],
      scenes: [{
        id: 'scene-1',
        imageUrl: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO7ZQn8AAAAASUVORK5CYII=',
        scriptText: '길게 이어지는 나레이션',
      }],
      narrationLines: [{
        sceneId: 'scene-1',
        audioUrl: 'data:audio/wav;base64,AAAA',
        duration: 2,
        startTime: 2.5,
      }],
      title: 'Edit Room Narration Tail FCP',
      aspectRatio: '9:16',
      fps: 30,
    });

    const zip = await JSZip.loadAsync(await result.blob.arrayBuffer());
    const xmlEntryName = Object.keys(zip.files).find((name) => name.endsWith('.xml'));
    const xml = xmlEntryName ? (await zip.file(xmlEntryName)?.async('string')) || '' : '';
    const durationMatch = xml.match(/<sequence>\s*<name>[\s\S]*?<duration>(\d+)<\/duration>/);
    const endFrames = Array.from(xml.matchAll(/<end>(\d+)<\/end>/g)).map((match) => Number(match[1]));

    expect(Number(durationMatch?.[1] || '0')).toBe(135);
    expect(Math.max(...endFrames)).toBe(135);
    expect(xml).toContain('<pathurl>./001_narration_01.wav</pathurl>');
  });

  it('일반 CapCut draft — narration이 scene end보다 길 때 draft.duration이 narration end까지 확장', async () => {
    const { generateCapCutDraftJson } = await import('../nleExportService');
    const result = generateCapCutDraftJson({
      scenes: buildSingleScene(),
      title: 'General CapCut Narration Tail',
      videoFileName: 'video.mp4',
      width: 1080,
      height: 1920,
      fps: 30,
      videoDurationSec: 1,
      narrationLines: [
        { audioFileName: '002_narration.mp3', duration: 1, startTime: 3, endTime: 4, text: '추가 줄' },
      ],
    });

    const draft = JSON.parse(result.json) as { duration?: number };
    expect(draft.duration).toBe(4_000_000);
  });

  it('일반 CapCut draft — narration이 endTime 필드만 가지고 duration이 없거나 0일 때 endTime까지 duration이 확장', async () => {
    const { generateCapCutDraftJson } = await import('../nleExportService');
    const result = generateCapCutDraftJson({
      scenes: buildSingleScene(),
      title: 'General CapCut Narration endTime Only',
      videoFileName: 'video.mp4',
      width: 1080,
      height: 1920,
      fps: 30,
      videoDurationSec: 1,
      hasAudioTrack: false,
      narrationLines: [
        { audioFileName: '001_narration.mp3', duration: 0, startTime: 1, endTime: 4, text: '끝까지 유지' },
      ],
    });

    const draft = JSON.parse(result.json) as {
      duration?: number;
      materials?: { audios?: Array<{ duration?: number }> };
      tracks?: Array<{
        type?: string;
        segments?: Array<{ target_timerange?: { start?: number; duration?: number } }>;
      }>;
    };
    const narrationTrack = draft.tracks?.find((track) => track.type === 'audio');

    expect(draft.duration).toBe(4_000_000);
    expect(draft.materials?.audios?.[0]?.duration).toBe(3_000_000);
    expect(narrationTrack?.segments?.[0]?.target_timerange?.start).toBe(1_000_000);
    expect(narrationTrack?.segments?.[0]?.target_timerange?.duration).toBe(3_000_000);
  });

  it('Edit Room CapCut draft duration expands to the farthest narration clip', async () => {
    const { buildEditRoomNleZip } = await import('../nleExportService');
    const result = await buildEditRoomNleZip({
      target: 'capcut',
      timeline: [{
        sceneId: 'scene-1',
        sceneIndex: 0,
        imageStartTime: 0,
        imageEndTime: 2,
        imageDuration: 2,
        subtitleSegments: [],
        effectPreset: '',
        volume: 1,
        speed: 1,
      }],
      scenes: [{
        id: 'scene-1',
        imageUrl: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO7ZQn8AAAAASUVORK5CYII=',
        scriptText: '길게 이어지는 나레이션',
      }],
      narrationLines: [{
        sceneId: 'scene-1',
        audioUrl: 'data:audio/wav;base64,AAAA',
        duration: 2,
        startTime: 2.5,
      }],
      title: 'Edit Room Narration Tail CapCut',
      aspectRatio: '9:16',
      fps: 30,
    });

    const zip = await JSZip.loadAsync(await result.blob.arrayBuffer());
    const draftEntryName = Object.keys(zip.files).find((name) => name.endsWith('/draft_content.json'));
    const draftMetaEntryName = Object.keys(zip.files).find((name) => name.endsWith('/draft_meta_info.json'));
    const draft = JSON.parse(draftEntryName ? (await zip.file(draftEntryName)?.async('string')) || '{}' : '{}') as { duration?: number };
    const draftMeta = JSON.parse(draftMetaEntryName ? (await zip.file(draftMetaEntryName)?.async('string')) || '{}' : '{}') as { tm_duration?: number };

    expect(draft.duration).toBe(4_500_000);
    expect(draftMeta.tm_duration).toBe(4_500_000);
  });

  it('buildNarrationClipPlacements clamps NaN and Infinity inputs to finite fallback values', async () => {
    const { buildNarrationClipPlacements } = await import('../nleExportService');
    const placements = buildNarrationClipPlacements(
      [{
        audioFileName: 'bad clip.mp3',
        startTime: Number.NaN,
        endTime: Number.POSITIVE_INFINITY,
        duration: Number.NaN,
        text: '문제 입력',
      }],
      [{
        timelineStartSec: Number.NaN,
        targetDurationSec: Number.POSITIVE_INFINITY,
      }],
    );

    expect(placements).toEqual([{
      startSec: 0,
      endSec: 3,
      durationSec: 3,
      fileName: 'bad_clip.mp3',
    }]);
    expect(placements.every((clip) => Number.isFinite(clip.startSec) && Number.isFinite(clip.endSec) && Number.isFinite(clip.durationSec))).toBe(true);
  });

  it('buildNarrationClipPlacements respects explicit endTime when narration is trimmed shorter than scene fallback', async () => {
    const { buildNarrationClipPlacements } = await import('../nleExportService');
    const placements = buildNarrationClipPlacements(
      [{
        audioFileName: 'trimmed narration.mp3',
        startTime: 0,
        endTime: 1,
        text: '짧게 트림',
      }],
      [{
        timelineStartSec: 0,
        timelineEndSec: 3,
        targetDurationSec: 3,
      }],
    );

    expect(placements).toEqual([{
      startSec: 0,
      endSec: 1,
      durationSec: 1,
      fileName: 'trimmed_narration.mp3',
    }]);
  });

  it('buildNarrationClipPlacements prioritizes explicit duration over conflicting endTime', async () => {
    const { buildNarrationClipPlacements } = await import('../nleExportService');
    const placements = buildNarrationClipPlacements(
      [{
        audioFileName: 'duration wins.mp3',
        startTime: 0,
        endTime: 5,
        duration: 2,
        text: 'duration 우선',
      }],
      [{
        timelineStartSec: 0,
        timelineEndSec: 3,
        targetDurationSec: 3,
      }],
    );

    expect(placements).toEqual([{
      startSec: 0,
      endSec: 2,
      durationSec: 2,
      fileName: 'duration_wins.mp3',
    }]);
  });

  it('buildEdlSourceFileMap falls back to 300 seconds when source duration is zero', async () => {
    const { buildEdlSourceFileMap } = await import('../nleExportService');
    const fileMap = buildEdlSourceFileMap(
      [{
        id: 'e1',
        order: '1',
        narrationText: '첫 컷',
        sourceId: 'source-a',
        sourceDescription: 'clip-a',
        speedFactor: 1,
        timecodeStart: 0,
        timecodeEnd: 1,
        note: '',
      }],
      [{
        id: 'video-a',
        sourceId: 'source-a',
        file: new Blob(['a'], { type: 'video/mp4' }) as File,
        blobUrl: 'blob:a',
        fileName: 'clip-a.mp4',
        fileSizeMB: 1,
        durationSec: 0,
      }],
      {
        'source-a': 'video-a',
      },
    );

    expect(fileMap.get('video-a')?.dur).toBe(300);
  });

  it('EDL Premiere ZIP renames source files when they collide with reserved export names', async () => {
    const { buildEdlNlePackageZip } = await import('../nleExportService');
    const reservedXmlBlob = new Blob(['xml-source'], { type: 'video/mp4' }) as File;
    const reservedSrtBlob = new Blob(['srt-source'], { type: 'video/mp4' }) as File;
    const title = 'Collision Project';
    const safeName = 'Collision_Project';
    const zipBlob = await buildEdlNlePackageZip({
      target: 'premiere',
      entries: [
        {
          id: 'e1',
          order: '1',
          narrationText: '첫 컷',
          sourceId: 'source-a',
          sourceDescription: 'reserved-xml',
          speedFactor: 1,
          timecodeStart: 0,
          timecodeEnd: 1,
          note: '',
        },
        {
          id: 'e2',
          order: '2',
          narrationText: '둘째 컷',
          sourceId: 'source-b',
          sourceDescription: 'reserved-srt',
          speedFactor: 1,
          timecodeStart: 0,
          timecodeEnd: 1,
          note: '',
        },
      ],
      sourceVideos: [
        {
          id: 'video-a',
          sourceId: 'source-a',
          file: reservedXmlBlob,
          blobUrl: 'blob:reserved-xml',
          fileName: `${safeName}.xml`,
          fileSizeMB: 1,
          durationSec: 1,
        },
        {
          id: 'video-b',
          sourceId: 'source-b',
          file: reservedSrtBlob,
          blobUrl: 'blob:reserved-srt',
          fileName: `${safeName}_나레이션.srt`,
          fileSizeMB: 1,
          durationSec: 1,
        },
      ],
      sourceMapping: {
        'source-a': 'video-a',
        'source-b': 'video-b',
      },
      title,
    });

    const zip = await JSZip.loadAsync(await zipBlob.arrayBuffer());
    const fileNames = Object.keys(zip.files);
    const xml = await zip.file(`${safeName}.xml`)?.async('string');

    expect(fileNames).toEqual(expect.arrayContaining([
      `${safeName}.xml`,
      `${safeName}_나레이션.srt`,
      `${safeName}-1.xml`,
      `${safeName}_나레이션-1.srt`,
    ]));
    expect(xml || '').toContain(`<pathurl>./${safeName}-1.xml</pathurl>`);
    expect(xml || '').toContain(`<pathurl>./${safeName}_나레이션-1.srt</pathurl>`);
  });

  it('EDL Premiere ZIP packages source files with pathurls that match the ZIP root', async () => {
    const { buildEdlNlePackageZip } = await import('../nleExportService');
    const clipABlob = new Blob(['a'], { type: 'video/mp4' }) as File;
    const clipBBlob = new Blob(['b'], { type: 'video/mp4' }) as File;
    const zipBlob = await buildEdlNlePackageZip({
      target: 'premiere',
      entries: [
        {
          id: 'e1',
          order: '1',
          narrationText: '첫 컷',
          sourceId: 'source-a',
          sourceDescription: 'clip-a',
          speedFactor: 1,
          timecodeStart: 0,
          timecodeEnd: 1,
          note: '',
        },
        {
          id: 'e2',
          order: '2',
          narrationText: '둘째 컷',
          sourceId: 'source-b',
          sourceDescription: 'clip-b',
          speedFactor: 1,
          timecodeStart: 0,
          timecodeEnd: 1,
          note: '',
        },
      ],
      sourceVideos: [
        {
          id: 'video-a',
          sourceId: 'source-a',
          file: clipABlob,
          blobUrl: 'blob:a',
          fileName: 'clip-a.mp4',
          fileSizeMB: 1,
          durationSec: 1,
        },
        {
          id: 'video-b',
          sourceId: 'source-b',
          file: clipBBlob,
          blobUrl: 'blob:b',
          fileName: 'clip-b.mp4',
          fileSizeMB: 1,
          durationSec: 1,
        },
      ],
      sourceMapping: {
        'source-a': 'video-a',
        'source-b': 'video-b',
      },
      title: 'EDL Zip Match',
    });

    const zip = await JSZip.loadAsync(await zipBlob.arrayBuffer());
    const xmlEntryName = Object.keys(zip.files).find((name) => name.endsWith('.xml'));
    const xml = xmlEntryName ? await zip.file(xmlEntryName)?.async('string') : '';

    expect(Object.keys(zip.files)).toEqual(expect.arrayContaining([
      'clip-a.mp4',
      'clip-b.mp4',
    ]));
    expect(xml).toContain('<pathurl>./clip-a.mp4</pathurl>');
    expect(xml).toContain('<pathurl>./clip-b.mp4</pathurl>');
  });
});

describe('downloadNlePackageZip', () => {
  it('starts ZIP download immediately and revokes the blob URL later', async () => {
    const { downloadNlePackageZip } = await import('../nleExportService');
    vi.useFakeTimers();

    const globalScope = globalThis as typeof globalThis & { document?: Document };
    const previousDocument = globalScope.document;
    const testDocument = new linkedom.DOMParser().parseFromString('<html><body></body></html>', 'text/html') as unknown as Document;
    globalScope.document = testDocument;

    const createdAnchors: HTMLAnchorElement[] = [];
    const anchorClicks: Array<ReturnType<typeof vi.fn>> = [];
    const createObjectURL = vi.fn(() => 'blob:nle-zip');
    const revokeObjectURL = vi.fn();
    const originalCreateElement = testDocument.createElement.bind(testDocument);
    const createElementSpy = vi.spyOn(testDocument, 'createElement').mockImplementation(((tagName: string) => {
      const element = originalCreateElement(tagName);
      if (tagName.toLowerCase() === 'a') {
        const clickSpy = vi.fn();
        (element as HTMLAnchorElement).click = clickSpy as unknown as () => void;
        createdAnchors.push(element as HTMLAnchorElement);
        anchorClicks.push(clickSpy);
      }
      return element;
    }) as typeof document.createElement);

    const urlCtor = URL as typeof URL & {
      createObjectURL: (blob: Blob) => string;
      revokeObjectURL: (url: string) => void;
    };
    const previousCreateObjectURL = urlCtor.createObjectURL;
    const previousRevokeObjectURL = urlCtor.revokeObjectURL;
    urlCtor.createObjectURL = createObjectURL;
    urlCtor.revokeObjectURL = revokeObjectURL;

    try {
      testDocument.body.innerHTML = '';
      downloadNlePackageZip(new Blob(['zip'], { type: 'application/zip' }), 'sample_premiere.zip');

      expect(createObjectURL).toHaveBeenCalledTimes(1);
      expect(createdAnchors).toHaveLength(1);
      expect(createdAnchors[0].download).toBe('sample_premiere.zip');
      expect(anchorClicks[0]).toHaveBeenCalledTimes(1);
      expect(testDocument.body.contains(createdAnchors[0])).toBe(false);

      vi.advanceTimersByTime(60_000);
      expect(revokeObjectURL).toHaveBeenCalledWith('blob:nle-zip');
    } finally {
      createElementSpy.mockRestore();
      urlCtor.createObjectURL = previousCreateObjectURL;
      urlCtor.revokeObjectURL = previousRevokeObjectURL;
      globalScope.document = previousDocument;
      vi.useRealTimers();
      testDocument.body.innerHTML = '';
    }
  });
});
