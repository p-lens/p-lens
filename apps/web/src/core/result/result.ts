/**
 * The outcome of anything that can fail. Failure is a value carrying what
 * happened, never a thrown exception and never a sentence meant for display.
 */
export type Result<T, E> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly error: E }

export const Ok = <T>(value: T): Result<T, never> => ({ ok: true, value })

export const Err = <E>(error: E): Result<never, E> => ({ ok: false, error })

export const mapOk = <T, U, E>(result: Result<T, E>, transform: (value: T) => U): Result<U, E> =>
  result.ok ? Ok(transform(result.value)) : result

export const mapErr = <T, E, F>(result: Result<T, E>, transform: (error: E) => F): Result<T, F> =>
  result.ok ? result : Err(transform(result.error))

export const andThen = <T, U, E, F>(result: Result<T, E>, next: (value: T) => Result<U, F>): Result<U, E | F> =>
  result.ok ? next(result.value) : result

/** Every value, or the first failure in the order given. */
export const collect = <T, E>(results: readonly Result<T, E>[]): Result<readonly T[], E> =>
  results.reduce<Result<readonly T[], E>>(
    (gathered, result) => andThen(gathered, (values) => mapOk(result, (value) => [...values, value])),
    Ok([]),
  )
