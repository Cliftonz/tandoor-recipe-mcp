// Single source of truth for filename → MIME mappings used by the three
// upload handlers (recipe image, user-file, AI import). Previously each
// handler kept its own switch — that already drifted (`.heic` was in
// recipe + ai but missing in admin, so a user uploading a HEIC photo got
// `application/octet-stream` only from `upload_user_file`).
//
// Adding a new extension touches one file. Handlers that want to restrict
// to a subset (recipe.ts wants image-only) pass an explicit allow set.

const MIME_TABLE: Readonly<Record<string, string>> = Object.freeze({
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.heic': 'image/heic',
  '.pdf': 'application/pdf',
  '.mp4': 'video/mp4',
  '.mov': 'video/quicktime',
});

export const IMAGE_EXTS: ReadonlySet<string> = new Set([
  '.png', '.jpg', '.jpeg', '.gif', '.webp', '.heic',
]);

/**
 * Guess a MIME type from a filename. When `allow` is provided, extensions
 * outside that set fall back to `application/octet-stream` — used by the
 * recipe-image handler to refuse forwarding PDFs as recipe photos.
 */
export function guessMimeFromExt(filename: string, allow?: ReadonlySet<string>): string {
  const idx = filename.lastIndexOf('.');
  if (idx < 0) return 'application/octet-stream';
  const ext = filename.slice(idx).toLowerCase();
  if (allow && !allow.has(ext)) return 'application/octet-stream';
  return MIME_TABLE[ext] ?? 'application/octet-stream';
}
