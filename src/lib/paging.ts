type Page = { results: any[]; next: string | null };

export async function allPages(fetchPage: (page: number) => Promise<Page>): Promise<any[]> {
  const items: any[] = [];
  for (let page = 1; ; page++) {
    const r = await fetchPage(page);
    items.push(...r.results);
    if (!r.next) return items;
  }
}
