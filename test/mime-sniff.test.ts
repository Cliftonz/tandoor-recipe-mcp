import { describe, it, expect } from 'vitest';
import { sniffMime } from '../src/lib/mime.js';

const bytes = (...values: number[]) => new Uint8Array(values);
const ascii = (text: string) => new TextEncoder().encode(text);

const PNG = bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00);
const JPEG = bytes(0xff, 0xd8, 0xff, 0xe0, 0x00);
const GIF = ascii('GIF89a\0');
const WEBP = ascii('RIFF\x10\0\0\0WEBPVP8 ');
const PDF = ascii('%PDF-1.7\n');
const UNKNOWN = ascii('hello world');

describe('sniffMime', () => {
  it.each([
    ['png', PNG, 'image/png'],
    ['jpeg', JPEG, 'image/jpeg'],
    ['gif', GIF, 'image/gif'],
    ['webp', WEBP, 'image/webp'],
    ['pdf', PDF, 'application/pdf'],
  ])('recognizes %s by magic bytes without a filename', (_label, head, expected) => {
    expect(sniffMime(head)).toBe(expected);
  });

  it('prefers magic bytes over a contradicting extension', () => {
    expect(sniffMime(JPEG, 'recipe.pdf')).toBe('image/jpeg');
  });

  it('does not treat a non-WebP RIFF container as webp', () => {
    expect(sniffMime(ascii('RIFF\x10\0\0\0WAVEfmt '))).toBe('application/octet-stream');
  });

  it('falls back to the filename extension when no signature matches', () => {
    expect(sniffMime(UNKNOWN, 'clip.MOV')).toBe('video/quicktime');
  });

  it('returns octet-stream when neither bytes nor filename identify the type', () => {
    expect(sniffMime(UNKNOWN, 'notes.txt')).toBe('application/octet-stream');
    expect(sniffMime(UNKNOWN)).toBe('application/octet-stream');
  });

  it('does not match a signature longer than the input', () => {
    expect(sniffMime(bytes(0x89, 0x50), 'a.gif')).toBe('image/gif');
  });
});
