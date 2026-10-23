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
  /** What the page is called: a browser's tab and a search's result. */
  readonly pageTitle: string
  /** What it is, in a line, for whoever finds it by a search. */
  readonly description: string
  /** What it is, in a few words, for a card where a link to it is shared. */
  readonly tagline: string
  /** Its address, ending in a slash. */
  readonly address: string
  readonly landingPage: string | undefined
  /** Who runs it, as a page of theirs that says so and where they are written to. */
  readonly operatorPage: string
} = {
  name: "P-Lens",
  nameInJapanese: "Pレンズ",
  pageTitle: "Pレンズ｜アプリスタート",
  description: "パチンコ・パチスロの収支をつける帳簿アプリ。ライブ計測、貯玉・貯メダル、カレンダー、集計で収支を振り返れます。データは端末の中に、会計は hledger で。",
  tagline: "パチンコ・パチスロの帳簿",
  address: "https://app.p-lens.jp/",
  landingPage: "https://p-lens.jp",
  operatorPage: "https://p-lens.jp/about/",
}
