import type { Response } from 'express';

const ESCAPES: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
const escapeHtml = (text: string) => text.replace(/[&<>"']/g, (char) => ESCAPES[char]);

const STYLE = 'body{font-family:system-ui,sans-serif;max-width:34rem;margin:3rem auto;padding:0 1rem;line-height:1.5}code{word-break:break-all}.error{color:#b00020}';

function sendPage(res: Response, status: number, body: string): void {
  res
    .status(status)
    .set({
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Frame-Options': 'DENY',
      'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; frame-ancestors 'none'",
    })
    .send(
      `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">` +
        `<title>Connect to Tandoor</title><style>${STYLE}</style></head><body><h1>Connect to Tandoor</h1>${body}</body></html>`,
    );
}

interface ConsentView {
  app: string;
  appDetail: string | undefined;
  redirectUri: string;
  tandoorUrl: string;
  hidden: Record<string, string | undefined>;
  error: string | undefined;
}

export function renderConsent(res: Response, status: number, { app, appDetail, redirectUri, tandoorUrl, hidden, error }: ConsentView): void {
  const hiddenInputs = Object.entries(hidden)
    .filter((entry): entry is [string, string] => entry[1] !== undefined)
    .map(([name, value]) => `<input type="hidden" name="${name}" value="${escapeHtml(value)}">`)
    .join('');
  const tandoor = escapeHtml(tandoorUrl);
  sendPage(
    res,
    status,
    `<p><strong>${escapeHtml(app)}</strong>${appDetail ? ` (${escapeHtml(appDetail)})` : ''} wants to access your Tandoor account at <strong>${tandoor}</strong></p>` +
      `<p>After you approve, you&#39;ll return to <code>${escapeHtml(redirectUri)}</code>.</p>` +
      (error ? `<p class="error" role="alert">${escapeHtml(error)}</p>` : '') +
      `<form method="post" action="/consent">${hiddenInputs}` +
      `<p>Paste a Tandoor API token. The app uses it to act as you in Tandoor.</p>` +
      `<p><label for="tandoor_token">Tandoor API token</label><br>` +
      `<input type="password" name="tandoor_token" id="tandoor_token" autocomplete="off"></p>` +
      `<p><a href="${tandoor}/settings/api" target="_blank" rel="noopener noreferrer">Create an API token in Tandoor</a></p>` +
      `<button type="submit" name="action" value="approve">Approve</button> ` +
      `<button type="submit" name="action" value="deny">Deny</button></form>`,
  );
}

export function renderExpired(res: Response): void {
  sendPage(res, 400, '<p>This sign-in form expired. Start connecting again from your app.</p>');
}
