import { describe, it, expect } from 'vitest';

const url = process.env.TANDOOR_URL;
const token = process.env.TANDOOR_TOKEN;
const headers = { Authorization: `Bearer ${token}` };

async function recipeFileHead(id: string | undefined): Promise<{ status: number; head: string }> {
  const res = await fetch(`${url}/api/get_recipe_file/${id}/`, { headers });
  return { status: res.status, head: Buffer.from(await res.arrayBuffer()).subarray(0, 4).toString('hex') };
}

async function list(path: string): Promise<any[]> {
  const res = await fetch(`${url}${path}?page_size=200`, { headers });
  return (await res.json()).results;
}

(url && token ? describe : describe.skip)('bootstrap local storage recipes', () => {
  it('serves the synced PDF fixture for the exported PDF recipe', async () => {
    expect(await recipeFileHead(process.env.TANDOOR_TEST_LOCAL_PDF_RECIPE_ID)).toEqual({
      status: 200,
      head: Buffer.from('%PDF').toString('hex'),
    });
  });

  it('serves the synced JPEG fixture for the exported JPEG recipe', async () => {
    const { status, head } = await recipeFileHead(process.env.TANDOOR_TEST_LOCAL_JPEG_RECIPE_ID);
    expect({ status, head: head.slice(0, 6) }).toEqual({ status: 200, head: 'ffd8ff' });
  });

  it('holds exactly one e2e-local storage and one sync for the fixture path', async () => {
    const storages = (await list('/api/storage/')).filter((s) => s.name === 'e2e-local');
    const syncs = (await list('/api/sync/')).filter((s) => s.path === '/opt/recipes/local-storage');
    expect({ storages: storages.length, syncs: syncs.length }).toEqual({ storages: 1, syncs: 1 });
  });

  it.skipIf(!process.env.TANDOOR_TEST_FIRST_LOCAL_PDF_RECIPE_ID)('keeps the first bootstrap run ids on a re-run', () => {
    expect({
      pdf: process.env.TANDOOR_TEST_LOCAL_PDF_RECIPE_ID,
      jpeg: process.env.TANDOOR_TEST_LOCAL_JPEG_RECIPE_ID,
    }).toEqual({
      pdf: process.env.TANDOOR_TEST_FIRST_LOCAL_PDF_RECIPE_ID,
      jpeg: process.env.TANDOOR_TEST_FIRST_LOCAL_JPEG_RECIPE_ID,
    });
  });
});
