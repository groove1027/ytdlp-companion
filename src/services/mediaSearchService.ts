import type { CompactMediaRecord, CommunityMediaItem, MediaSource, MediaType } from '../types';

const SOURCES: MediaSource[] = ['klipy', 'irasutoya', 'google', 'myinstants', 'sfx_lab'];
const TYPES: MediaType[] = ['image', 'sfx'];

const dataCache: Partial<Record<string, CompactMediaRecord[]>> = {};
const loadingPromises: Partial<Record<string, Promise<CompactMediaRecord[]>>> = {};

async function loadSourceData(source: string): Promise<CompactMediaRecord[]> {
  if (dataCache[source]) return dataCache[source]!;
  if (loadingPromises[source]) return loadingPromises[source]!;

  const filename = `media-${source.replace('_', '-')}.json`;
  const promise = fetch(`/data/${filename}`)
    .then((res) => {
      if (!res.ok) throw new Error(`Failed to load ${filename}: ${res.status}`);
      return res.json() as Promise<CompactMediaRecord[]>;
    })
    .then((data) => {
      dataCache[source] = data;
      delete loadingPromises[source];
      return data;
    })
    .catch((err) => {
      console.warn(`[mediaSearch] Failed to load ${source}:`, err);
      delete loadingPromises[source];
      return [] as CompactMediaRecord[];
    });

  loadingPromises[source] = promise;
  return promise;
}

export async function preloadAllMedia(): Promise<void> {
  await Promise.all(SOURCES.filter(s => s !== 'google').map(loadSourceData));
}

function toMediaItem(record: CompactMediaRecord, source: MediaSource): CommunityMediaItem {
  return {
    id: record.i,
    type: TYPES[record.t] || 'image',
    source,
    url: record.U,
    thumbnailUrl: record.u,
    title: record.n,
    tags: record.g,
    format: record.f,
  };
}

function scoreMatch(record: CompactMediaRecord, keywords: string[]): number {
  let score = 0;
  const titleLower = record.n.toLowerCase();
  const tagsLower = record.g.map((t) => t.toLowerCase());
  for (const kw of keywords) {
    const kwLower = kw.toLowerCase();
    if (titleLower === kwLower) score += 10;
    else if (titleLower.includes(kwLower)) score += 5;
    if (tagsLower.some((t) => t.includes(kwLower))) score += 3;
  }
  return score;
}

export interface MediaSearchOptions {
  query: string;
  type?: 'image' | 'sfx';
  source?: MediaSource;
  limit?: number;
}

/** 한글→영어 키워드 매핑 (한글 검색 지원) */
const KO_EN_MAP: Record<string, string> = {
  '반응': 'reaction',
  '웃음': 'laugh funny lol',
  '웃기': 'funny laugh',
  '웃긴': 'funny hilarious',
  '재미': 'funny fun',
  '놀람': 'surprise shock surprised',
  '놀라': 'surprise shock wow',
  '충격': 'shock shocking',
  '분노': 'angry rage mad',
  '화남': 'angry mad',
  '화나': 'angry mad furious',
  '슬픔': 'sad cry crying',
  '슬픈': 'sad crying tears',
  '울음': 'cry crying tears',
  '박수': 'clap applause',
  '환호': 'cheer cheering crowd',
  '칼': 'sword slash cut blade',
  '폭발': 'explosion boom blast',
  '불': 'fire flame burning',
  '물': 'water splash',
  '바람': 'wind blow',
  '알림': 'notification bell alert',
  '벨': 'bell ring notification',
  '타자': 'typing keyboard type',
  '고양이': 'cat kitten kitty',
  '강아지': 'dog puppy',
  '동물': 'animal pet',
  '새': 'bird',
  '돈': 'money cash coin',
  '하트': 'heart love',
  '사랑': 'love heart romance',
  '축하': 'congratulations celebration party',
  '파티': 'party celebration',
  '춤': 'dance dancing',
  '음악': 'music song',
  '박자': 'beat rhythm drum',
  '드럼': 'drum beat percussion',
  '경적': 'horn honk',
  '사이렌': 'siren alarm emergency',
  '경보': 'alarm alert warning siren',
  '비명': 'scream screaming',
  '소리': 'sound noise',
  '문': 'door knock',
  '발걸음': 'footstep walk step',
  '총': 'gun shot gunshot',
  '차': 'car vehicle drive',
  '자동차': 'car vehicle automobile',
  '비행기': 'airplane plane flight',
  '전화': 'phone call ring',
  '클릭': 'click button tap',
  '성공': 'success win victory',
  '실패': 'fail failure error wrong',
  '오류': 'error wrong fail',
  '맞다': 'correct right yes',
  '틀리다': 'wrong incorrect no',
  '승리': 'victory win winner',
  '패배': 'lose defeat loser',
  '음식': 'food eat eating',
  '먹방': 'eating mukbang food',
  '요리': 'cooking cook kitchen',
  '커피': 'coffee',
  '맥주': 'beer drink',
  '건배': 'cheers toast drink',
  '크리스마스': 'christmas xmas holiday',
  '할로윈': 'halloween spooky',
  '생일': 'birthday party cake',
  '아기': 'baby infant cute',
  '귀여운': 'cute adorable kawaii',
  '무서운': 'scary horror creepy',
  '공포': 'horror scary ghost',
  '유령': 'ghost phantom spooky',
  '마법': 'magic spell wizard',
  '별': 'star sparkle',
  '번개': 'lightning thunder',
  '천둥': 'thunder lightning storm',
  '비': 'rain rainy weather',
  '눈': 'snow winter',
  '바다': 'ocean sea wave',
  '산': 'mountain nature',
  '꽃': 'flower bloom',
  '나무': 'tree nature forest',
  '태양': 'sun sunshine',
  '달': 'moon night',
  '왕': 'king crown royal',
  '공주': 'princess queen',
  '로봇': 'robot android machine',
  '외계인': 'alien ufo',
  '축구': 'soccer football goal',
  '야구': 'baseball',
  '농구': 'basketball',
  '운동': 'sport exercise gym',
  '게임': 'game gaming play',
  '사진': 'photo camera picture',
  '영상': 'video film movie',
  '영화': 'movie film cinema',
  '학교': 'school study education',
  '책': 'book reading',
  '컴퓨터': 'computer pc laptop',
  '인터넷': 'internet web online',
  '돈벌기': 'money earn profit',
  '기쁨': 'happy joy glad',
  '행복': 'happy happiness joy',
  '짜증': 'annoyed irritated frustrated',
  '지루': 'bored boring',
  '당황': 'embarrassed confused awkward',
  '혼란': 'confused confusion chaos',
  '걱정': 'worried worry anxious',
  '피곤': 'tired exhausted sleepy',
  '잠': 'sleep sleeping zzz',
  '눈물': 'tears crying emotional',
  '감동': 'touching emotional moved',
  '소름': 'goosebumps chills wow',
  '대박': 'amazing incredible wow',
  '미쳤': 'crazy insane wild',
  '어이없': 'ridiculous absurd unbelievable',
  '한숨': 'sigh sighing breath',
  '박장대소': 'rofl lmao hysterical',
  '짝짝짝': 'clap applause bravo',
};

/** 한글 키워드를 영어로 변환 (부분 매칭 포함) */
function expandKoreanQuery(keywords: string[]): string[] {
  const expanded = [...keywords];
  for (const kw of keywords) {
    // 정확 매칭
    if (KO_EN_MAP[kw]) {
      expanded.push(...KO_EN_MAP[kw].split(' '));
      continue;
    }
    // 부분 매칭: 한글 키워드가 매핑 키에 포함되거나 역으로
    for (const [ko, en] of Object.entries(KO_EN_MAP)) {
      if (ko.includes(kw) || kw.includes(ko)) {
        expanded.push(...en.split(' '));
        break; // 첫 매칭만
      }
    }
  }
  return [...new Set(expanded)];
}

export async function searchMedia(options: MediaSearchOptions): Promise<CommunityMediaItem[]> {
  const { query, type, source, limit = 10 } = options;
  const rawKeywords = query.toLowerCase().split(/[\s,+]+/).filter((k) => k.length > 1);
  if (rawKeywords.length === 0) return [];
  // 한글 키워드 → 영어 확장
  const keywords = expandKoreanQuery(rawKeywords);

  let sourcesToSearch: MediaSource[];
  if (source) sourcesToSearch = [source];
  else if (type === 'sfx') sourcesToSearch = ['myinstants', 'sfx_lab'];
  else if (type === 'image') sourcesToSearch = ['klipy', 'irasutoya'];
  else sourcesToSearch = ['klipy', 'irasutoya', 'myinstants', 'sfx_lab'];

  const allResults: { item: CommunityMediaItem; score: number }[] = [];

  await Promise.all(
    sourcesToSearch.map(async (src) => {
      const records = await loadSourceData(src);
      for (const record of records) {
        if (type && TYPES[record.t] !== type) continue;
        const score = scoreMatch(record, keywords);
        if (score > 0) allResults.push({ item: toMediaItem(record, src), score });
      }
    })
  );

  allResults.sort((a, b) => b.score - a.score);
  return allResults.slice(0, limit).map((r) => r.item);
}

export async function searchReaction(query: string, limit = 5): Promise<CommunityMediaItem[]> {
  return searchMedia({ query, type: 'image', source: 'klipy', limit });
}

export async function searchIllustration(query: string, limit = 5): Promise<CommunityMediaItem[]> {
  return searchMedia({ query, type: 'image', source: 'irasutoya', limit });
}

export async function searchSfx(query: string, limit = 5): Promise<CommunityMediaItem[]> {
  return searchMedia({ query, type: 'sfx', limit });
}
