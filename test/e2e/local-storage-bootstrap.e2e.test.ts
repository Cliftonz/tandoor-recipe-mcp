import { describe, it, expect } from 'vitest';

const url = process.env.TANDOOR_URL;
const token = process.env.TANDOOR_TOKEN;

async function recipeFileHead(id: string | undefined): Promise<{ status: number; head: string }> {
  const res = await fetch(`${url}/api/get_recipe_file/${id}/`, { headers: { Authorization: `Bearer ${token}` } });
  return { status: res.status, head: Buffer.from(await res.arrayBuffer()).subarray(0, 4).toString('hex') };
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
});
