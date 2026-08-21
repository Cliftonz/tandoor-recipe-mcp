import { describe, it, expect, vi } from 'vitest';
import {
  handleListInviteLinks,
  handleGetInviteLink,
  handleCreateInviteLink,
  handleUpdateInviteLink,
  handleDeleteInviteLink,
  __test__ as inviteInternals,
} from '../src/handlers/invite-link.js';

function mkClient(over: any = {}) {
  return {
    inviteLinks: {
      listInviteLinks: vi.fn(async () => ({
        count: 1,
        next: null,
        previous: null,
        results: [{
          id: 3,
          uuid: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
          email: 'guest@example.com',
          group: { id: 2, name: 'guest' },
          valid_until: '2026-12-31',
          used_by: null,
          reusable: false,
          internal_note: 'sent via slack',
          created_by: 1,
          created_at: '2026-01-01T00:00:00Z',
        }],
      })),
      getInviteLink: vi.fn(async (id: number) => ({
        id,
        uuid: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
        email: 'guest@example.com',
        group: { id: 2, name: 'guest' },
        valid_until: '2026-12-31',
        used_by: null,
        reusable: false,
        internal_note: 'note',
        created_by: 1,
        created_at: '2026-01-01T00:00:00Z',
      })),
      createInviteLink: vi.fn(async (body: any) => ({
        id: 99,
        uuid: '11111111-2222-3333-4444-555555555555',
        used_by: null,
        created_by: 1,
        created_at: '2026-06-01T00:00:00Z',
        ...body,
      })),
      patchInviteLink: vi.fn(async (id: number, body: any) => ({
        id,
        uuid: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
        email: 'guest@example.com',
        group: { id: 2, name: 'guest' },
        valid_until: '2026-12-31',
        used_by: null,
        reusable: false,
        internal_note: 'note',
        created_by: 1,
        created_at: '2026-01-01T00:00:00Z',
        ...body,
      })),
      deleteInviteLink: vi.fn(async () => undefined),
    },
    ...over,
  } as any;
}

describe('invite-link handlers: list', () => {
  it('slim page keeps uuid + drops group/internal_note/created_by/created_at', async () => {
    const client = mkClient();
    const out = await handleListInviteLinks(client, {});
    const parsed = JSON.parse(out);
    expect(parsed.count).toBe(1);
    const row = parsed.results[0];
    expect(row).toEqual({
      id: 3,
      uuid: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
      email: 'guest@example.com',
      valid_until: '2026-12-31',
      reusable: false,
      used_by: null,
    });
  });

  it('passes pagination params through', async () => {
    const client = mkClient();
    await handleListInviteLinks(client, { page: 2, page_size: 25 });
    expect(client.inviteLinks.listInviteLinks).toHaveBeenCalledWith({ page: 2, page_size: 25 }, { signal: undefined });
  });

  it('format=full returns raw payload untouched', async () => {
    const client = mkClient();
    const out = await handleListInviteLinks(client, { format: 'full' });
    expect(out).toContain('"internal_note"');
    expect(out).toContain('"created_by"');
  });
});

describe('invite-link handlers: get', () => {
  it('slim keeps uuid so caller can share the link', async () => {
    const client = mkClient();
    const out = await handleGetInviteLink(client, { id: 3 });
    const parsed = JSON.parse(out);
    expect(parsed.uuid).toBe('aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee');
    expect(parsed).not.toHaveProperty('internal_note');
    expect(parsed).not.toHaveProperty('created_by');
  });
});

describe('invite-link handlers: create', () => {
  it('posts body and returns slim confirmation containing uuid', async () => {
    const client = mkClient();
    const out = await handleCreateInviteLink(client, {
      email: 'new@example.com',
      group: 2,
      valid_until: '2026-12-31',
      reusable: true,
      internal_note: 'via mcp',
    });
    expect(client.inviteLinks.createInviteLink).toHaveBeenCalledWith({
      email: 'new@example.com',
      group: 2,
      valid_until: '2026-12-31',
      reusable: true,
      internal_note: 'via mcp',
    }, { signal: undefined });
    expect(out).toContain('Invite link created');
    expect(out).toContain('"uuid":"11111111-2222-3333-4444-555555555555"');
  });
});

describe('invite-link handlers: update', () => {
  it('empty patch throws before hitting the network', async () => {
    const client = mkClient();
    await expect(handleUpdateInviteLink(client, { id: 3 })).rejects.toThrow(/At least one field/);
    expect(client.inviteLinks.patchInviteLink).not.toHaveBeenCalled();
  });

  it('sends only supplied fields', async () => {
    const client = mkClient();
    await handleUpdateInviteLink(client, { id: 3, reusable: true });
    expect(client.inviteLinks.patchInviteLink).toHaveBeenCalledWith(3, { reusable: true }, { signal: undefined });
  });
});

describe('invite-link handlers: delete', () => {
  it('calls delete and returns confirmation', async () => {
    const client = mkClient();
    const out = await handleDeleteInviteLink(client, { id: 3 });
    expect(client.inviteLinks.deleteInviteLink).toHaveBeenCalledWith(3, { signal: undefined });
    expect(out).toMatch(/3/);
    expect(out).toMatch(/deleted/i);
  });
});

describe('slimInviteLink used_by pass-through', () => {
  const base = {
    id: 1,
    uuid: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
    email: 'guest@example.com',
    valid_until: '2026-12-31',
    reusable: false,
  };

  it('null used_by passes through as null', () => {
    const out = inviteInternals.slimInviteLink({ ...base, used_by: null });
    expect(out.used_by).toBeNull();
  });

  it('nested {id, username} used_by passes through verbatim (matches Tandoor payload)', () => {
    const out = inviteInternals.slimInviteLink({ ...base, used_by: { id: 42, username: 'joe' } });
    expect(out.used_by).toEqual({ id: 42, username: 'joe' });
  });
});
