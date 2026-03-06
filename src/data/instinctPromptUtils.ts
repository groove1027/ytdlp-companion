import type { InstinctMechanism } from '../types';
import { INSTINCT_PARTS, getAllMechanisms, getMechanismById } from './instinctData';

/**
 * AI 주제 추천 프롬프트에 주입할 본능 분류 체계 텍스트 (~500 토큰)
 * PART 제목 + 서브카테고리 이름만 포함
 */
export function buildInstinctTaxonomy(): string {
  const lines: string[] = [];
  for (const part of INSTINCT_PARTS) {
    if (part.subCategories.length === 0) continue;
    lines.push(`PART ${part.partNumber}. ${part.title}`);
    for (const sc of part.subCategories) {
      const names = sc.mechanisms.map(m => m.name).join(', ');
      lines.push(`  ${sc.title}: ${names}`);
    }
  }
  return lines.join('\n');
}

/**
 * 선택된 기제들의 상세 프롬프트 텍스트 (대본 작성용)
 */
export function buildSelectedInstinctPrompt(ids: string[]): string {
  const found = ids.map(getMechanismById).filter(Boolean) as InstinctMechanism[];
  if (found.length === 0) return '';

  return found.map(m =>
    `- ${m.name}: ${m.description} (심리 근거: ${m.basis}) / 훅 키워드: ${m.hooks.join(', ')}`
  ).join('\n');
}

/**
 * 키워드로 메커니즘 검색 (이름/설명/훅에서 매칭)
 */
export function searchMechanisms(query: string): InstinctMechanism[] {
  if (!query.trim()) return [];
  const q = query.toLowerCase();
  return getAllMechanisms().filter(m =>
    m.name.toLowerCase().includes(q) ||
    m.description.toLowerCase().includes(q) ||
    m.basis.toLowerCase().includes(q) ||
    m.hooks.some(h => h.toLowerCase().includes(q))
  );
}

