import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { z } from 'zod';
import { TandoorClient } from '../src/clients/index.js';
import {
  handleCreateRecipeImport,
  handleUpdateRecipeImport,
  handleGetRecipeImport,
  handleListRecipeImports,
} from '../src/handlers/import.js';
import { createRecipeImportShape } from '../src/tools/import.js';
import { startStub, Stub } from './helpers/stub-http.js';

const nestedStorage = { id: 4, name: 'local', method: 'LOCAL', username: null, url: null, path: '/r', created_by: 1 };
const tandoorRow = {
  id: 9, storage: nestedStorage, name: 'a.pdf', file_uid: 'u', file_path: '/r/a.pdf', created_at: 't',
};

let stub: Stub;
let client: TandoorClient;
let lastBody: any;

beforeAll(async () => {
  stub = await startStub((req, res) => {
    let raw = '';
    req.on('data', (c) => { raw += c; });
    req.on('end', () => {
      lastBody = raw ? JSON.parse(raw) : undefined;
      res.setHeader('content-type', 'application/json');
      const body = req.url!.includes('?')
        ? { count: 1, next: null, previous: null, results: [tandoorRow] }
        : tandoorRow;
      res.end(JSON.stringify(body));
    });
  });
  client = new TandoorClient({ url: stub.url, token: 't' });
});
afterAll(() => stub.close());
beforeEach(() => { lastBody = undefined; });

describe('recipe-import against Tandoor 2.6 shape', () => {
  it('create input does not require space', () => {
    expect(z.object(createRecipeImportShape).safeParse({ name: 'a.pdf', storage: 4 }).success).toBe(true);
  });

  it('create sends storage as a bare id and no space', async () => {
    await handleCreateRecipeImport(client, { name: 'a.pdf', storage: 4, space: 1 } as any);
    expect(lastBody).toEqual({ name: 'a.pdf', storage: 4 });
  });

  it('update sends storage as a bare id and no space', async () => {
    await handleUpdateRecipeImport(client, { id: 9, storage: 4, space: 1 } as any);
    expect(lastBody).toEqual({ storage: 4 });
  });

  it('create does not send file_uid or file_path', async () => {
    await handleCreateRecipeImport(client, { name: 'a.pdf', storage: 4, file_uid: 'u', file_path: '/r/a.pdf' } as any);
    expect(lastBody).toEqual({ name: 'a.pdf', storage: 4 });
  });

  it('update with only file_uid and file_path is rejected as empty', async () => {
    await expect(handleUpdateRecipeImport(client, { id: 9, file_uid: 'u', file_path: '/r/a.pdf' } as any))
      .rejects.toThrow(/At least one field/);
    expect(lastBody).toBeUndefined();
  });

  it('slim output flattens nested storage to its id', async () => {
    const out = JSON.parse(await handleGetRecipeImport(client, { id: 9 }));
    expect(out.storage).toBe(4);
  });

  it('slim list output flattens nested storage to its id', async () => {
    const out = JSON.parse(await handleListRecipeImports(client, { page: 1 }));
    expect(out.results[0].storage).toBe(4);
  });
});
