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

export async function searchMedia(options: MediaSearchOptions): Promise<CommunityMediaItem[]> {
  const { query, type, source, limit = 10 } = options;
  const keywords = query.toLowerCase().split(/[\s,+]+/).filter((k) => k.length > 1);
  if (keywords.length === 0) return [];

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
