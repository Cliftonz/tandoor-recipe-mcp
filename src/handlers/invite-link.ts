import { TandoorClient } from '../clients/index.js';
import type {
  ListInviteLinksArgs,
  GetInviteLinkArgs,
  CreateInviteLinkArgs,
  UpdateInviteLinkArgs,
  DeleteInviteLinkArgs,
} from '../tools/invite-link.js';
import type { HandlerContext } from '../lib/register.js';
import { emit, slimPaginated, assertNonEmptyBody } from '../lib/slim.js';

// uuid is the shareable invite token the caller needs to hand out; keep it in
// the slim projection even though it looks sensitive.
// used_by is passed through verbatim per Tandoor's response shape (null when
// unused, nested {id, username} when redeemed); if Tandoor later adds
// sensitive fields to the nested object, revisit and project explicitly.
export function slimInviteLink(i: any) {
  if (!i) return i;
  return {
    id: i.id,
    uuid: i.uuid,
    email: i.email,
    valid_until: i.valid_until,
    reusable: i.reusable,
    used_by: i.used_by,
  };
}

export const __test__ = { slimInviteLink };

export async function handleListInviteLinks(
  client: TandoorClient,
  args: ListInviteLinksArgs,
  ctx?: HandlerContext,
): Promise<string> {
  const { format, ...params } = args;
  const r = await client.inviteLinks.listInviteLinks(params, { signal: ctx?.signal });
  return format === 'full' ? emit(r) : emit(slimPaginated(r, slimInviteLink));
}

export async function handleGetInviteLink(
  client: TandoorClient,
  args: GetInviteLinkArgs,
  ctx?: HandlerContext,
): Promise<string> {
  const r = await client.inviteLinks.getInviteLink(args.id, { signal: ctx?.signal });
  return args.format === 'full' ? emit(r) : emit(slimInviteLink(r));
}

export async function handleCreateInviteLink(
  client: TandoorClient,
  args: CreateInviteLinkArgs,
  ctx?: HandlerContext,
): Promise<string> {
  const body: any = {
    email: args.email,
    group: args.group,
    valid_until: args.valid_until,
  };
  if (args.reusable !== undefined) body.reusable = args.reusable;
  if (args.internal_note !== undefined) body.internal_note = args.internal_note;
  const r = await client.inviteLinks.createInviteLink(body, { signal: ctx?.signal });
  return `Invite link created.\n\n${emit(args.format === 'full' ? r : slimInviteLink(r))}`;
}

export async function handleUpdateInviteLink(
  client: TandoorClient,
  args: UpdateInviteLinkArgs,
  ctx?: HandlerContext,
): Promise<string> {
  const body: any = {};
  if (args.email !== undefined) body.email = args.email;
  if (args.group !== undefined) body.group = args.group;
  if (args.valid_until !== undefined) body.valid_until = args.valid_until;
  if (args.reusable !== undefined) body.reusable = args.reusable;
  if (args.internal_note !== undefined) body.internal_note = args.internal_note;
  assertNonEmptyBody(body);
  const r = await client.inviteLinks.patchInviteLink(args.id, body, { signal: ctx?.signal });
  return `Invite link updated.\n\n${emit(args.format === 'full' ? r : slimInviteLink(r))}`;
}

export async function handleDeleteInviteLink(
  client: TandoorClient,
  args: DeleteInviteLinkArgs,
  ctx?: HandlerContext,
): Promise<string> {
  await client.inviteLinks.deleteInviteLink(args.id, { signal: ctx?.signal });
  return `Invite link ${args.id} deleted.`;
}
