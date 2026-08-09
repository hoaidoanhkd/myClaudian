export async function mapWithConcurrency<T, U>(
  items: T[],
  fn: (item: T, index: number) => Promise<U>,
  concurrency: number,
): Promise<U[]> {
  if (concurrency < 1) throw new Error('Concurrency must be at least 1');
  const results: U[] = new Array<U>(items.length);
  let idx = 0;
  const worker = async () => {
    while (idx < items.length) {
      const i = idx++;
      results[i] = await fn(items[i], i);
    }
  };
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, worker));
  return results;
}

