// Typed `mockClient` helper. Replaces the inline `mock<T>(impl): any`
// pattern used in handler tests with one that preserves the real client
// interface — so a typo'd method name on the mock surfaces at compile time,
// not as a `TypeError: client.foo.bar is not a function` at runtime (QA F15).
//
// Usage:
//   const client = mockClient<TandoorClient>({
//     userPreferences: {
//       listPreferences: async () => paginated([...]),
//     },
//   });
//
// The DeepPartial mapped type lets test code stub only the methods/fields
// it cares about. The return type widens back to the real interface so
// `client.<method>` autocomplete works as if it were a full instance.

/**
 * Recursive partial type. Functions are kept as-is (you can replace any
 * client method with a mock fn that returns the same shape), objects are
 * recursively partial, primitives are themselves.
 */
export type DeepPartial<T> = {
  [K in keyof T]?: T[K] extends (...args: any[]) => any
    ? T[K]
    : T[K] extends object
      ? DeepPartial<T[K]>
      : T[K];
};

/**
 * Build a typed mock of `T` from a partial implementation. The return type
 * is `T` (not `Partial<T>`) so the handler-under-test can be called with
 * confidence — at the same time, TS rejects misspelled method names in
 * `impl` because `DeepPartial<T>` only accepts keys that exist on `T`.
 */
export function mockClient<T>(impl: DeepPartial<T>): T {
  return impl as T;
}
