/**
 * What this deployment goes by, who runs it, where it is, and where its
 * product is introduced at length. They are whoever runs the deployment's own, and
 * every place the app says its name reads it from here: a fork gives its
 * own name, its own address, and its own landing page or none.
 */
export const DEPLOYMENT: {
  /** Its name, as the top bar and every sentence that names it write it. */
  readonly name: string
  /** Its name as it is written in Japanese: what a tab, a home screen and an installed app are called. */
  readonly nameInJapanese: string
  /** What it is, in a line, for whoever finds it by a search. */
  readonly description: string
  /** What it is, in a few words, for a card where a link to it is shared. */
  readonly tagline: string
  /** Its address, ending in a slash. */
  readonly address: string
  readonly landingPage: string | undefined
  /** Who runs it: what they are called, and a page of theirs where they can be found. */
  readonly operator: { readonly name: string; readonly page: string }
} = {
  name: "P-Lens",
  nameInJapanese: "Pレンズ",
  description: "hledger を会計カーネルにした、パチンコ・パチスロの帳簿",
  tagline: "パチンコ・パチスロの帳簿",
  address: "https://app.p-lens.jp/",
  landingPage: "https://p-lens.jp",
  operator: { name: "P-Lens 運営者", page: "https://github.com/p-lens" },
}
