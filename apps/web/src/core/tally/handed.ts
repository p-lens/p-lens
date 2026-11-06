import { isHandedAccount } from "../journal/accounts"
import type { Entry } from "../journal/entry"
import { withEquityDeclared } from "../savings/balance"

const declares = (accounts: string, account: string): boolean => accounts.split("\n").some((line) => line.startsWith(`account ${account}`))

/**
 * A book's accounts as an entry needs them: with each account of tokens
 * handed between players that the entry posts to declared, once, and the
 * equity it stands under — a book whose plays never handed any has none —
 * and as they were otherwise.
 */
export const withHandedDeclaredFor = (accounts: string, entry: Entry): string =>
  entry.postings
    .map((posting) => posting.account)
    .filter(isHandedAccount)
    .filter((account, index, all) => all.indexOf(account) === index)
    .reduce((declared, account) => (declares(declared, account) ? declared : `${withEquityDeclared(declared).replace(/\n*$/, "")}\naccount ${account}\n`), accounts)
