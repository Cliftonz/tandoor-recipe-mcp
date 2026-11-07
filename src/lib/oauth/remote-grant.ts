export const TANDOOR_REJECTED_TOKEN = 'Tandoor rejected your token. Reconnect this connector to sign in again.';

export type RemoteGrant = { tandoorToken: string; revoke: () => void; wwwAuthenticate: string };
