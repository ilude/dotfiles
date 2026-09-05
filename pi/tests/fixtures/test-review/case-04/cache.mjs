export async function cached(fetcher, cache, now = Date.now, ttlMs = 1000) {
  if (cache.value !== undefined && now() - cache.cachedAt < ttlMs) return cache.value;
  if (cache.pending) return cache.pending;
  cache.pending = Promise.resolve().then(fetcher).then((value) => {
    cache.value = value;
    cache.cachedAt = now();
    delete cache.pending;
    return value;
  });
  return cache.pending;
}
