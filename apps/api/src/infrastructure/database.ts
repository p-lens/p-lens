import type { ApiError } from "../domain/errors"
import { Err, Ok, type Result } from "../domain/result"

/**
 * The part of D1 the repositories use. D1 satisfies it as it is; the tests
 * satisfy it with SQLite, so the same SQL is run against the same migrations.
 */
export interface Statement {
  bind(...values: readonly unknown[]): Statement
  all<T>(): Promise<{ readonly results: readonly T[] }>
  first<T>(): Promise<T | null>
  run(): Promise<unknown>
}

export interface Database {
  prepare(query: string): Statement
  /** Every statement or none: D1 runs a batch as one transaction. */
  batch(statements: readonly Statement[]): Promise<unknown>
}

/** Why a statement failed: a constraint it broke, or anything else. */
export type StatementFailure = { readonly type: "unique"; readonly detail: string } | { readonly type: "other"; readonly detail: string }

const failureOf = (cause: unknown): StatementFailure => {
  const detail = String(cause)
  return /UNIQUE constraint failed/i.test(detail) ? { type: "unique", detail } : { type: "other", detail }
}

const settled = async <T>(work: () => Promise<T>): Promise<Result<T, StatementFailure>> => {
  try {
    return Ok(await work())
  } catch (cause) {
    return Err(failureOf(cause))
  }
}

export const allRows = <T>(statement: Statement): Promise<Result<readonly T[], StatementFailure>> =>
  settled(async () => (await statement.all<T>()).results)

/** The first row, or `undefined`: D1's `null` stops here. */
export const firstRow = <T>(statement: Statement): Promise<Result<T | undefined, StatementFailure>> =>
  settled(async () => (await statement.first<T>()) ?? undefined)

export const execute = (statement: Statement): Promise<Result<void, StatementFailure>> => settled(async () => void (await statement.run()))

export const executeAll = (database: Database, statements: readonly Statement[]): Promise<Result<void, StatementFailure>> =>
  settled(async () => void (await database.batch(statements)))

/** A failure no caller expected, as the error a response carries. */
export const unexpected = (failure: StatementFailure): ApiError => ({ type: "storage", detail: failure.detail })
