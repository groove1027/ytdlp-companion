import { describe, expect, it, vi } from 'vitest';

vi.mock('../storageService', () => ({
  dbPromise: Promise.resolve(null),
}));

const { alignGeneratedScenesToSourceTexts } = await import('../gemini/scriptAnalysis');

describe('scriptAnalysis alignment', () => {
  it('keeps later prompts from shifting forward when an intermediate scene is missing', () => {
    const sourceTexts = [
      '33단락 고양이가 문을 열고 들어온다',
      '34단락 방 안에서 멈춰 선다',
      '35단락 창밖을 바라본다',
      '36단락 갑자기 뛰어나간다',
      '37단락 골목으로 사라진다',
    ];

    const alignments = alignGeneratedScenesToSourceTexts(
      [
        { scriptText: '33단락 고양이가 문을 열고 들어온다' },
        { scriptText: '34단락 방 안에서 멈춰 선다' },
        { scriptText: '36단락 갑자기 뛰어나간다' },
        { scriptText: '37단락 골목으로 사라진다' },
      ],
      sourceTexts,
    );

    expect(alignments.map((item) => item.generatedSceneIndex)).toEqual([0, 1, null, 2, 3]);
  });

  it('matches summarized scene text back to the closest original paragraph in order', () => {
    const sourceTexts = [
      '첫 장면: 오래된 시장에서 상인이 손님을 부른다',
      '둘째 장면: 손님이 값을 흥정하며 웃는다',
      '셋째 장면: 비가 오기 시작하고 상인이 천막을 친다',
    ];

    const alignments = alignGeneratedScenesToSourceTexts(
      [
        { scriptText: '오래된 시장에서 상인이 손님을 부른다' },
        { scriptText: '손님이 값을 흥정하며 웃는다' },
        { scriptText: '비가 오자 상인이 천막을 친다' },
      ],
      sourceTexts,
    );

    expect(alignments.map((item) => item.generatedSceneIndex)).toEqual([0, 1, 2]);
    expect(alignments[2].score).toBeGreaterThan(0.2);
  });
});
