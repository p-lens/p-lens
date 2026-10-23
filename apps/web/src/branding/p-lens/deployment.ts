import type { Deployment } from "../deployment"

/** P-Lens as its operator serves it at app.p-lens.jp. */
export const DEPLOYMENT: Deployment = {
  name: "P-Lens",
  nameInJapanese: "Pレンズ",
  pageTitle: "Pレンズ｜アプリスタート",
  description: "パチンコ・パチスロの収支をつける帳簿アプリ。ライブ計測、貯玉・貯メダル、カレンダー、集計で収支を振り返れます。データは端末の中に、会計は hledger で。",
  tagline: "パチンコ・パチスロの帳簿",
  indexed: true,
  themeColor: "#102075",
  address: "https://app.p-lens.jp/",
  landingPage: "https://p-lens.jp",
  operatorPage: "https://p-lens.jp/about/",
}
