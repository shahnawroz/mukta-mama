// Supabase returns at most 1,000 rows per request. This keeps asking for the next batch until
// every row has been read, so lists and totals never silently stop at 1,000.
// The query must have a stable order (end it with .order("id")) so batches do not overlap.
export async function fetchAll<R extends { data: unknown[] | null; error: unknown }>(
  page: (from: number, to: number) => PromiseLike<R>,
): Promise<R> {
  const size = 1000;
  const rows: unknown[] = [];
  let last!: R;
  for (let from = 0; ; from += size) {
    last = await page(from, from + size - 1);
    if (last.error) return last;
    const data = last.data ?? [];
    rows.push(...data);
    if (data.length < size) break;
  }
  return { ...last, data: rows } as R;
}
