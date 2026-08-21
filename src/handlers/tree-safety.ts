import { TandoorClient } from '../clients/index.js';
import type { TreeSafetyAction } from '../clients/tree-safety.js';
import type { HandlerContext } from '../lib/register.js';
import { emit } from '../lib/slim.js';

function isNotFound(err: unknown): boolean {
  if ((err as any)?.status === 404) return true;
  const msg = err instanceof Error ? err.message : '';
  return /\b404\b/.test(msg) || /Not Found/i.test(msg);
}

export function makeTreeSafetyHandler(resource: string, action: TreeSafetyAction) {
  return async (client: TandoorClient, args: { id: number }, ctx?: HandlerContext): Promise<string> => {
    try {
      const r = await client.treeSafety.preview(resource, args.id, action, { signal: ctx?.signal });
      return emit(r);
    } catch (err) {
      if (isNotFound(err)) {
        // WHY log: the friendly wrap discards the underlying error text; the
        // operator still needs the raw message to distinguish "id truly gone"
        // from "auth failed and Tandoor returned a 404-shaped body".
        const underlying = err instanceof Error ? err.message : String(err);
        console.error(`[tandoor-mcp] tree-safety 404 wrap resource=${resource} id=${args.id} action=${action} underlying=${underlying}`);
        throw new Error(`${resource} with id ${args.id} not found`);
      }
      throw err;
    }
  };
}
