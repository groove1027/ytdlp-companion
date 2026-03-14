/**
 * KIE API Rate-Limited Batch Runner
 *
 * KIE 공식 레이트 리밋: 20 new requests / 10 seconds (≈100+ concurrent tasks)
 * 안정적 운영: 10 requests / 10 seconds, 최대 100 concurrent
 *
 * 기존 슬라이딩 윈도우(keep N active) 대신 버스트 제출(submit N per window) 방식:
 *   - 10초마다 10개씩 밀어넣기 → KIE 서버에서 동시 처리
 *   - 동시 처리 100개 도달 시 잠시 멈췄다가 완료 시 재개
 *   - 잔액 부족(QUOTA_EXHAUSTED) 감지 시 즉시 중단
 */

export interface KieBatchOptions {
  /** 10초 윈도우당 제출 수 (기본 10) */
  submitPerWindow?: number;
  /** 윈도우 간격 ms (기본 10_000) */
  windowMs?: number;
  /** 최대 동시 처리 수 (기본 100) */
  maxConcurrent?: number;
  /** 잔액 부족 에러 감지 함수 */
  isQuotaExhausted?: (error: unknown) => boolean;
}

/**
 * KIE API 레이트 리밋에 맞춘 배치 실행기
 *
 * @param items - 처리할 항목 배열
 * @param fn - 각 항목을 처리하는 비동기 함수 (create task + poll 포함)
 * @param onItemDone - 항목 하나가 완료(성공/실패)될 때마다 호출
 * @param options - 레이트 리밋 설정
 */
export async function runKieBatch<T>(
  items: T[],
  fn: (item: T) => Promise<void>,
  onItemDone: () => void,
  options?: KieBatchOptions,
): Promise<void> {
  const {
    submitPerWindow = 10,
    windowMs = 10_000,
    maxConcurrent = 100,
    isQuotaExhausted,
  } = options || {};

  const queue = [...items];
  const active: Promise<void>[] = [];
  let quotaExhausted = false;

  while ((queue.length > 0 || active.length > 0) && !quotaExhausted) {
    // 버스트 제출: submitPerWindow개까지 (maxConcurrent 초과 방지)
    const burstCount = Math.min(
      queue.length,
      submitPerWindow,
      Math.max(0, maxConcurrent - active.length),
    );

    for (let i = 0; i < burstCount && !quotaExhausted; i++) {
      const item = queue.shift()!;
      const p = fn(item).catch((e) => {
        if (isQuotaExhausted?.(e)) {
          quotaExhausted = true;
          queue.length = 0;
        }
      }).finally(() => {
        const idx = active.indexOf(p);
        if (idx > -1) active.splice(idx, 1);
        onItemDone();
      });
      active.push(p);
    }

    if (queue.length > 0 && !quotaExhausted) {
      if (active.length >= maxConcurrent) {
        // 동시 처리 한도 도달 — 하나 완료될 때까지 대기
        await Promise.race(active);
      } else {
        // 레이트 리밋 윈도우 대기 후 다음 버스트 제출
        await new Promise(resolve => setTimeout(resolve, windowMs));
      }
    } else if (active.length > 0) {
      // 모든 항목 제출 완료 — 나머지 완료 대기
      await Promise.allSettled(active);
    }
  }
}
