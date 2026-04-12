import { logger } from '../services/LoggerService';

type SubscribeListener<TArgs extends unknown[] = unknown[]> = (...args: TArgs) => void;

type SubscribableStore<TArgs extends unknown[] = unknown[]> = {
  subscribe?: (listener: SubscribeListener<TArgs>) => unknown;
};

export function safeStoreSubscribe<TArgs extends unknown[] = unknown[]>(
  store: SubscribableStore<TArgs> | null | undefined,
  listener: SubscribeListener<TArgs>,
  label = 'unknown-store',
): () => void {
  if (!store || typeof store.subscribe !== 'function') {
    logger.warn('[safeStoreSubscribe] subscribe unavailable', { label });
    return () => {};
  }

  const unsubscribe = store.subscribe(listener);
  if (typeof unsubscribe === 'function') {
    return () => {
      unsubscribe();
    };
  }

  logger.warn('[safeStoreSubscribe] unsubscribe unavailable', { label });
  return () => {};
}
