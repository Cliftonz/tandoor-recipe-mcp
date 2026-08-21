import { BaseClient } from './base.js';

type Opts = { signal?: AbortSignal };

export type TreeSafetyAction = 'cascading' | 'nulling' | 'protecting';

// WHY: `resource` is interpolated straight into the URL path. Today all
// callers pass a slug from the static RESOURCES table so no user input
// reaches here, but a future refactor exposing slug to LLM args would allow
// path traversal (`../users`). Enforce the allow-list at the trust boundary
// so client misuse fails loud.
const ALLOWED_RESOURCES = new Set<string>([
  'food', 'keyword', 'recipe', 'unit', 'storage',
  'meal-type', 'property-type', 'recipe-book',
  'supermarket', 'supermarket-category', 'user-file',
]);

export class TreeSafetyClient extends BaseClient {
  async preview(resource: string, id: number, action: TreeSafetyAction, opts?: Opts): Promise<any> {
    if (!ALLOWED_RESOURCES.has(resource)) {
      throw new Error(`tree-safety: unknown resource '${resource}'`);
    }
    return this.request(`/api/${resource}/${id}/${action}/`, { signal: opts?.signal });
  }
}
