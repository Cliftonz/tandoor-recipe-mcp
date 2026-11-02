import { describe, it, expect } from 'vitest';
import { dispositionFilename } from '../src/lib/content-disposition.js';

const mimeB = (value: string) => `=?utf-8?b?${Buffer.from(value).toString('base64')}?=`;

describe('dispositionFilename', () => {
  it.each([
    ['a missing header', null, ''],
    ['a header without a filename', 'inline', ''],
    ['a quoted filename', 'inline; filename="Soup.pdf"', 'Soup.pdf'],
    ['an uppercase parameter name', 'INLINE; FILENAME="Soup.pdf"', 'Soup.pdf'],
    ['backslash escapes in a quoted filename', 'inline; filename="Mom\\\'s \\"best\\" \\\\ soup.pdf"', 'Mom\'s "best" \\ soup.pdf'],
    ['an unquoted token', 'inline; filename=Soup.pdf', 'Soup.pdf'],
    ['an RFC 8187 filename*', "inline; filename*=UTF-8''Cr%C3%A8me%20br%C3%BBl%C3%A9e.pdf", 'Crème brûlée.pdf'],
    ['a lowercase utf-8 filename*', "inline; filename*=utf-8''Cr%C3%A8me.pdf", 'Crème.pdf'],
    ['filename* over filename', 'inline; filename="plain.pdf"; filename*=UTF-8\'\'fancy%20name.pdf', 'fancy name.pdf'],
    ['filename* over a later filename', "inline; filename*=UTF-8''fancy.pdf; filename=plain.pdf", 'fancy.pdf'],
    ['malformed filename* with a filename fallback', "inline; filename*=UTF-8''bad%E0%A4%A.pdf; filename=\"fallback.pdf\"", 'fallback.pdf'],
    ['malformed filename* alone', "inline; filename*=UTF-8''bad%ZZ.pdf", ''],
    ['an RFC 2047 b-encoded header', mimeB('inline; filename="Crème brûlée.pdf"'), 'Crème brûlée.pdf'],
    ['an RFC 2047 q-encoded header', '=?utf-8?q?inline=3B_filename=3D=22Cr=C3=A8me_br=C3=BBl=C3=A9e.pdf=22?=', 'Crème brûlée.pdf'],
  ])('handles %s', (_case, header, expected) => {
    expect(dispositionFilename(header)).toBe(expected);
  });
});
