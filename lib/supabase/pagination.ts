/** Ordered, inclusive PostgREST ranges. Never return a partial success. */
export async function fetchAllPages<T, E>(
  fetchPage: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: E | null }>,
  pageSize = 1000,
): Promise<{ data: T[] | null; error: E | null }> {
  if (!Number.isInteger(pageSize) || pageSize < 1) throw new Error('Invalid page size')
  const rows: T[] = []
  for (let from = 0; ; from += pageSize) {
    const result = await fetchPage(from, from + pageSize - 1)
    if (result.error) return { data: null, error: result.error }
    if (!result.data) throw new Error('Missing page data')
    rows.push(...result.data)
    if (result.data.length < pageSize) return { data: rows, error: null }
  }
}
