// AI provider + AI import handlers.

import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { TandoorClient } from '../clients/index.js';
import { saveScrapedRecipe, slimRecipe, isUsableScrape, ScrapedRecipe } from './recipe.js';
import type { ListAiProvidersArgs, AiImportRecipeArgs } from '../tools/ai.js';

const emit = (o: unknown) => JSON.stringify(o);

function slimProvider(p: any) {
  if (!p) return p;
  return { id: p.id, name: p.name, ai_model_type: p.ai_model_type };
}

export async function handleListAiProviders(
  client: TandoorClient,
  args: ListAiProvidersArgs
): Promise<string> {
  const { format, ...params } = args;
  const r = await client.ai.listAiProviders(params);
  if (format === 'full') return emit(r);
  return emit({
    count: r.count,
    next: r.next,
    previous: r.previous,
    results: (r.results || []).map(slimProvider),
  });
}

function guessMimeType(filename: string): string {
  const ext = path.extname(filename).toLowerCase();
  switch (ext) {
    case '.png': return 'image/png';
    case '.jpg':
    case '.jpeg': return 'image/jpeg';
    case '.gif': return 'image/gif';
    case '.webp': return 'image/webp';
    case '.pdf': return 'application/pdf';
    case '.heic': return 'image/heic';
    default: return 'application/octet-stream';
  }
}

async function loadFile(args: { file_path?: string; file_url?: string }): Promise<{ data: Buffer; filename: string; mimeType: string } | null> {
  if (args.file_path) {
    const data = await readFile(args.file_path);
    const filename = path.basename(args.file_path);
    return { data, filename, mimeType: guessMimeType(filename) };
  }
  if (args.file_url) {
    const res = await fetch(args.file_url);
    if (!res.ok) throw new Error(`Failed to fetch file_url: ${res.status} ${res.statusText}`);
    const ab = await res.arrayBuffer();
    const filename = (() => {
      try { return path.basename(new URL(args.file_url!).pathname) || 'upload'; } catch { return 'upload'; }
    })();
    const mimeType = res.headers.get('content-type') || guessMimeType(filename);
    return { data: Buffer.from(ab), filename, mimeType };
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
  args: AiImportRecipeArgs
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
  });

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
