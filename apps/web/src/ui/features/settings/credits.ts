/**
 * What has to be credited, as collected at build time by
 * scripts/collect-licenses.mjs from the packages themselves, so nothing here
 * is a claim anyone typed by hand.
 */

/** Where a credited piece of work came from. */
export type Origin = "hackage" | "ghc" | "local" | "crates" | "npm" | "vendored"

export interface Credit {
  readonly name: string
  readonly version?: string
  readonly origin: Origin
  /** As the package declares it, which is not always an SPDX identifier. */
  readonly license?: string
  readonly copyright?: string
  readonly homepage?: string
  readonly note?: string
  /** The licence as the package ships it. Absent when it ships none. */
  readonly text?: string
}

/** hledger and what is linked into it, each engine and its crates, and the web app's packages. */
export type GroupId = "hledger" | "pachinko" | "pachislot" | "web"

export interface Credits {
  readonly collected: string
  readonly hledgerRevision?: string
  readonly groups: readonly { readonly id: GroupId; readonly packages: readonly Credit[] }[]
}

/**
 * Loaded on demand rather than imported, so that a hundred and eighty
 * licences are not carried by everyone who only wants to look at their books.
 */
export const loadCredits = async (): Promise<Credits> => {
  const module = await import("../../../generated/licenses.json?raw")
  return JSON.parse(module.default) as Credits
}
