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

import * as linkedom from 'linkedom';
import { describe, expect, it } from 'vitest';

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

function parseXml(xml: string): Document {
  return new linkedom.DOMParser().parseFromString(xml, 'text/xml') as unknown as Document;
}

function getDirectChild(parent: Element, tagName: string): Element | null {
  return Array.from(parent.children).find((child) => child.tagName === tagName) ?? null;
}

function getChildText(parent: Element, tagName: string): string {
  return (getDirectChild(parent, tagName)?.textContent || '').trim();
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
});
