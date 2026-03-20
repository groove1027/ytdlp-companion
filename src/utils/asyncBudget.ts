const ABORT_ERROR_NAME = 'AbortError';

export type AsyncBudgetResult<T> = {
  timedOut: boolean;
  value: T | null;
};

export function createAbortError(message: string = '작업이 취소되었습니다.'): Error {
  if (typeof DOMException !== 'undefined') {
    return new DOMException(message, ABORT_ERROR_NAME);
  }
  const error = new Error(message);
  error.name = ABORT_ERROR_NAME;
  return error;
}

export function isAbortError(error: unknown): boolean {
  if (typeof DOMException !== 'undefined' && error instanceof DOMException) {
    return error.name === ABORT_ERROR_NAME;
  }
  if (error instanceof Error) {
    return error.name === ABORT_ERROR_NAME || /abort|aborted|취소/i.test(error.message);
  }
  return false;
}

export async function waitForSoftTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  options?: { signal?: AbortSignal },
): Promise<AsyncBudgetResult<T>> {
  const { signal } = options || {};
  if (signal?.aborted) throw createAbortError();

  let timeoutId: ReturnType<typeof setTimeout> | null = null;

  return new Promise<AsyncBudgetResult<T>>((resolve, reject) => {
    let settled = false;
    const cleanup = () => {
      if (timeoutId) clearTimeout(timeoutId);
      signal?.removeEventListener('abort', handleAbort);
    };
    const finish = (result: AsyncBudgetResult<T>) => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve(result);
    };
    const fail = (error: unknown) => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(error);
    };
    const handleAbort = () => fail(createAbortError());

    timeoutId = setTimeout(() => finish({ timedOut: true, value: null }), timeoutMs);
    signal?.addEventListener('abort', handleAbort, { once: true });

    promise.then(
      (value) => finish({ timedOut: false, value }),
      (error) => fail(error),
    );
  });
}

export async function runAbortableTaskWithBudget<T>(
  taskFactory: (signal: AbortSignal) => Promise<T>,
  timeoutMs: number,
  options?: { signal?: AbortSignal },
): Promise<AsyncBudgetResult<T>> {
  const { signal } = options || {};
  if (signal?.aborted) throw createAbortError();

  const taskController = new AbortController();
  let timedOut = false;
  let timeoutId: ReturnType<typeof setTimeout> | null = null;

  const onParentAbort = () => taskController.abort();
  signal?.addEventListener('abort', onParentAbort, { once: true });

  const taskPromise = taskFactory(taskController.signal)
    .then((value) => ({ timedOut: false, value }))
    .catch((error) => {
      if (signal?.aborted) {
        throw createAbortError();
      }
      if (timedOut || isAbortError(error)) {
        return { timedOut: true, value: null };
      }
      throw error;
    });

  const timeoutPromise = new Promise<AsyncBudgetResult<T>>((resolve) => {
    timeoutId = setTimeout(() => {
      timedOut = true;
      taskController.abort();
      resolve({ timedOut: true, value: null });
    }, timeoutMs);
  });

  try {
    return await Promise.race([taskPromise, timeoutPromise]);
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
    signal?.removeEventListener('abort', onParentAbort);
  }
}
