import type { TokenKind } from "../commodity/commodity"
import { readSavingsAccount } from "../journal/accounts"

export type ParlorId = string & { readonly __brand: "ParlorId" }

/** The id survey.p-lens.jp gives a parlor submitted to the list, carried until the list has it. */
export type SubmissionId = string & { readonly __brand: "SubmissionId" }

/** One kind of token at one rental rate: what a parlor keeps separate savings of. */
export interface SavingsPool {
  readonly kind: TokenKind
  /** The rental rate as the journal names it, e.g. `4円`. */
  readonly tier: string
}

export const samePool = (left: SavingsPool, right: SavingsPool): boolean => left.kind === right.kind && left.tier === right.tier

/**
 * Who a parlor in a book is: one on the parlor list, by the list's id, or one
 * submitted to it and not listed yet, by its submission. When the list takes
 * a submission, the parlor gains the list's id and keeps its submission.
 */
export type ParlorIdentity = { readonly type: "listed"; readonly id: ParlorId } | { readonly type: "submitted"; readonly submission: SubmissionId }

export const sameIdentity = (left: ParlorIdentity, right: ParlorIdentity): boolean =>
  left.type === "listed" ? right.type === "listed" && left.id === right.id : right.type === "submitted" && left.submission === right.submission

/** An identity as one word, for keeping a choice in a form. */
export const identityKey = (identity: ParlorIdentity): string => (identity.type === "listed" ? `listed:${identity.id}` : `submitted:${identity.submission}`)

/**
 * A parlor as a book knows it: who it is, a name, and the savings the book
 * keeps there.
 *
 * Not stored anywhere beside the journal. A parlor is the savings accounts
 * declared for it, tagged `parlor-id` or `parlor-submission`, and is read
 * back from those.
 */
export interface Parlor {
  readonly identity: ParlorIdentity
  readonly name: string
  readonly pools: readonly SavingsPool[]
}

export const PARLOR_ID_TAG = "parlor-id"

export const PARLOR_SUBMISSION_TAG = "parlor-submission"

/** The tags a parlor's accounts and its tallies carry: its list id, or its submission while it waits. */
export const identityTags = (identity: ParlorIdentity): readonly (readonly [string, string])[] =>
  identity.type === "listed" ? [[PARLOR_ID_TAG, identity.id]] : [[PARLOR_SUBMISSION_TAG, identity.submission]]

/** An account declaration as hledger reports it: its name and its tags. */
export interface DeclaredAccount {
  readonly name: string
  readonly tags: readonly (readonly [string, string])[]
}

interface ParlorAccount {
  readonly identity: ParlorIdentity
  readonly name: string
  readonly pool: SavingsPool
}

const tagIn = (tags: DeclaredAccount["tags"], tag: string): string | undefined => {
  const value = tags.find(([name]) => name === tag)?.[1]
  return value === undefined || value === "" ? undefined : value
}

/**
 * Who the parlor is that an account's or a tally's tags name, if they name
 * one. A list id wins over a submission: tags carrying both are a
 * submission the list has taken.
 */
export const identityIn = (tags: DeclaredAccount["tags"]): ParlorIdentity | undefined => {
  const id = tagIn(tags, PARLOR_ID_TAG)
  const submission = tagIn(tags, PARLOR_SUBMISSION_TAG)
  if (id !== undefined) return { type: "listed", id: id as ParlorId }
  return submission === undefined ? undefined : { type: "submitted", submission: submission as SubmissionId }
}

const parlorAccountOf = (account: DeclaredAccount): ParlorAccount | undefined => {
  const savings = readSavingsAccount(account.name)
  const identity = identityIn(account.tags)
  return savings === undefined || identity === undefined ? undefined : { identity, name: savings.parlorName, pool: { kind: savings.kind, tier: savings.tier } }
}

const mergeInto = (parlors: readonly Parlor[], account: ParlorAccount): readonly Parlor[] =>
  parlors.some((parlor) => sameIdentity(parlor.identity, account.identity))
    ? parlors.map((parlor) =>
        sameIdentity(parlor.identity, account.identity) && !parlor.pools.some((pool) => samePool(pool, account.pool))
          ? { ...parlor, pools: [...parlor.pools, account.pool] }
          : parlor,
      )
    : [...parlors, { identity: account.identity, name: account.name, pools: [account.pool] }]

/** The parlors a book's declarations describe, in the order first declared. */
export const parlorsFromDeclarations = (accounts: readonly DeclaredAccount[]): readonly Parlor[] =>
  accounts
    .map(parlorAccountOf)
    .filter((account): account is ParlorAccount => account !== undefined)
    .reduce(mergeInto, [])
