/** The outcome of anything that can fail, as in the web app: a value, never a throw. */
export type Result<T, E> = { readonly ok: true; readonly value: T } | { readonly ok: false; readonly error: E }

export const Ok = <T>(value: T): Result<T, never> => ({ ok: true, value })

export const Err = <E>(error: E): Result<never, E> => ({ ok: false, error })
