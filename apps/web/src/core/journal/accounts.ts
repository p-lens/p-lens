import type { TokenKind } from "../commodity/commodity"

/**
 * The account tree every P-Lens book is kept in. Small on purpose; it grows
 * when a book needs a branch it does not have, not before.
 */
export const ACCOUNTS = {
  cash: "資産:現金",
  playRevenue: "収益:遊技",
  playExpense: "費用:遊技",
  theoreticalValue: "統計:期待値",
  inferredTheoreticalValue: "統計:期待値:推定",
  replayFee: "費用:再プレイ手数料",
  openingBalance: "純資産:開始残高",
  balanceAdjustment: "純資産:残高調整",
  specialPrizes: "純資産:特殊景品",
  oddPrizes: "純資産:端玉景品",
  translationAdjustment: "純資産:換算調整勘定",
} as const

/** The branch revenue is kept under. */
const REVENUE_ROOT = "収益"

/**
 * Whether an account's amounts are written turned over from how a person
 * reads them. A journal credits revenue, so 4,800 balls won stand in the
 * book as -4,800; anywhere but the book's own files they are read as won.
 */
export const isWrittenReversed = (account: string): boolean => account === REVENUE_ROOT || account.startsWith(`${REVENUE_ROOT}:`)

const SAVINGS_ROOTS: Readonly<Record<TokenKind, string>> = { ball: "資産:貯玉", medal: "資産:貯メダル" }

const RENTAL_SPREAD_ACCOUNTS: Readonly<Record<TokenKind, string>> = {
  ball: "費用:貸玉差額",
  medal: "費用:貸メダル差額",
}

export const savingsRoot = (kind: TokenKind): string => SAVINGS_ROOTS[kind]

/** Where a parlor keeps a person's savings of one kind of token at one rental rate. */
export const savingsAccount = (kind: TokenKind, parlorName: string, tier: string): string => `${SAVINGS_ROOTS[kind]}:${parlorName}:${tier}`

/** Where the loss on renting tokens above their exchange value is written. */
export const rentalSpreadAccount = (kind: TokenKind): string => RENTAL_SPREAD_ACCOUNTS[kind]

/**
 * Which kind of savings an account holds, at which parlor and rental rate, if
 * it is a savings account at all: exactly a parlor and a rate under the root.
 */
export const readSavingsAccount = (
  account: string,
): { readonly kind: TokenKind; readonly parlorName: string; readonly tier: string } | undefined =>
  (Object.keys(SAVINGS_ROOTS) as TokenKind[])
    .filter((kind) => account.startsWith(`${SAVINGS_ROOTS[kind]}:`))
    .map((kind) => ({ kind, parts: account.slice(SAVINGS_ROOTS[kind].length + 1).split(":") }))
    .flatMap(({ kind, parts }) => {
      const [parlorName, tier, ...rest] = parts
      return parlorName === undefined || parlorName === "" || tier === undefined || tier === "" || rest.length > 0 ? [] : [{ kind, parlorName, tier }]
    })
    .at(0)
