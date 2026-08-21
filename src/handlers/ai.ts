// AI provider + AI import handlers.

import path from 'node:path';
import { TandoorClient } from '../clients/index.js';
import { saveScrapedRecipe, slimRecipe, isUsableScrape, ScrapedRecipe } from './recipe.js';
import type {
  ListAiProvidersArgs,
  AiImportRecipeArgs,
  GetAiProviderArgs,
  CreateAiProviderArgs,
  UpdateAiProviderArgs,
  DeleteAiProviderArgs,
  AiStepSortArgs,
} from '../tools/ai.js';

import { emit, assertNonEmptyBody } from '../lib/slim.js';
import { readSafeUpload } from '../lib/path-guard.js';
import { safeFetchBytes } from '../lib/safe-fetch.js';
import { guessMimeFromExt } from '../lib/mime.js';
import type { HandlerContext } from '../lib/register.js';

const MAX_AI_INGEST_BYTES = 25 * 1024 * 1024; // 25MB cap on URL-fetched AI ingest files.

// list_ai_providers returns a lighter shape than get/create/update per Tandoor's API; two projectors keep each caller minimal.
function slimAiProviderList(p: any) {
  if (!p) return p;
  return { id: p.id, name: p.name, ai_model_type: p.ai_model_type };
}

// api_key is a real provider credential; slim mode omits it so a routine
// list/get never surfaces the secret to callers that did not ask for it.
function slimAiProvider(p: any) {
  if (p == null) return p;
  return {
    id: p.id,
    name: p.name,
    endpoint: p.endpoint,
    model_name: p.model_name,
    provider: p.provider,
  };
}

export const __test__ = { slimAiProvider };

export async function handleListAiProviders(
  client: TandoorClient,
  args: ListAiProvidersArgs,
  ctx?: HandlerContext,
): Promise<string> {
  const { format, ...params } = args;
  const r = await client.ai.listAiProviders(params, { signal: ctx?.signal });
  if (format === 'full') return emit(r);
  return emit({
    count: r.count,
    next: r.next,
    previous: r.previous,
    results: (r.results || []).map(slimAiProviderList),
  });
}

// guessMimeType moved to ../lib/mime.ts (guessMimeFromExt). AI ingest
// accepts the full set so no allow filter.

async function loadFile(args: { file_path?: string; file_url?: string }): Promise<{ data: Buffer; filename: string; mimeType: string } | null> {
  if (args.file_path) {
    // Validate + open with O_NOFOLLOW + ino/dev re-check.
    const { data, safePath } = await readSafeUpload(args.file_path);
    return { data, filename: path.basename(safePath), mimeType: guessMimeFromExt(path.basename(safePath)) };
  }
  if (args.file_url) {
    // SSRF guard + 25MB cap.
    const { res, bytes } = await safeFetchBytes(args.file_url, {}, { maxBytes: MAX_AI_INGEST_BYTES });
    if (!res.ok) throw new Error(`Failed to fetch file_url: ${res.status} ${res.statusText}`);
    const filename = (() => {
      try { return path.basename(new URL(args.file_url!).pathname) || 'upload'; } catch { return 'upload'; }
    })();
    const mimeType = res.headers.get('content-type') || guessMimeFromExt(filename);
    return { data: Buffer.from(bytes), filename, mimeType };
  }
  return null;
}

async function pickProviderId(client: TandoorClient, explicit?: number): Promise<number> {
  if (explicit) return explicit;
  const list = await client.ai.listAiProviders({ page_size: 1 });
  const first = list?.results?.[0];
  if (!first?.id) {
    throw new Error('No ai_provider_id given and no AI providers configured. Use list_ai_providers and pass an ai_provider_id.');
  }
  return first.id;
}

export async function handleAiImportRecipe(
  client: TandoorClient,
  args: AiImportRecipeArgs,
  ctx?: HandlerContext,
): Promise<string> {
  if (!args.file_path && !args.file_url && !args.text) {
    throw new Error('Provide at least one of: file_path, file_url, text');
  }

  const ai_provider_id = await pickProviderId(client, args.ai_provider_id);
  const file = await loadFile(args);

  const resp = await client.ai.aiImport({
    ai_provider_id,
    file: file ?? undefined,
    text: args.text,
  }, { signal: ctx?.signal });

  // If we shouldn't save, just return the parsed result.
  if (args.save === false) {
    return emit(resp);
  }

  const scraped = resp?.recipe as ScrapedRecipe | undefined;
  if (!isUsableScrape(scraped)) {
    return (
      `AI import did not return a usable recipe.\n` +
      `Tandoor msg: ${resp?.msg || '(none)'}\n\n${emit(resp)}`
    );
  }

  // Source URL won't exist for an upload; synthesize a placeholder so the
  // saved recipe still has something pointing back at the input.
  const sourceLabel = args.file_url || args.file_path || 'ai-import';
  const recipeForSave: ScrapedRecipe = {
    ...scraped,
    name: scraped.name || args.name || sourceLabel,
    source_url: scraped.source_url || (args.file_url || ''),
  };
  const saved = await saveScrapedRecipe(client, recipeForSave, args.file_url || '');
  const out = args.format === 'full' ? saved : slimRecipe(saved);
  return `AI-imported recipe saved.\n\n${emit(out)}`;
}

export async function handleGetAiProvider(
  client: TandoorClient,
  args: GetAiProviderArgs,
  ctx?: HandlerContext,
): Promise<string> {
  const r = await client.ai.getAiProvider(args.id, { signal: ctx?.signal });
  return args.format === 'full' ? emit(r) : emit(slimAiProvider(r));
}

export async function handleCreateAiProvider(
  client: TandoorClient,
  args: CreateAiProviderArgs,
  ctx?: HandlerContext,
): Promise<string> {
  const { format, ...body } = args;
  const r = await client.ai.createAiProvider(body, { signal: ctx?.signal });
  return `AI provider created.\n\n${emit(format === 'full' ? r : slimAiProvider(r))}`;
}

export async function handleUpdateAiProvider(
  client: TandoorClient,
  args: UpdateAiProviderArgs,
  ctx?: HandlerContext,
): Promise<string> {
  const body: any = {};
  if (args.name !== undefined) body.name = args.name;
  if (args.api_key !== undefined) body.api_key = args.api_key;
  if (args.endpoint !== undefined) body.endpoint = args.endpoint;
  if (args.model_name !== undefined) body.model_name = args.model_name;
  if (args.provider !== undefined) body.provider = args.provider;
  assertNonEmptyBody(body);
  const r = await client.ai.patchAiProvider(args.id, body, { signal: ctx?.signal });
  return `AI provider updated.\n\n${emit(args.format === 'full' ? r : slimAiProvider(r))}`;
}

export async function handleDeleteAiProvider(
  client: TandoorClient,
  args: DeleteAiProviderArgs,
  ctx?: HandlerContext,
): Promise<string> {
  await client.ai.deleteAiProvider(args.id, { signal: ctx?.signal });
  return `AI provider ${args.id} deleted.`;
}

export async function handleAiStepSort(
  client: TandoorClient,
  args: AiStepSortArgs,
  ctx?: HandlerContext,
): Promise<string> {
  const r = await client.ai.aiStepSort({ recipe: args.recipe_id }, { signal: ctx?.signal });
  return emit(r);
}
