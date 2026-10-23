import type { Deployment } from "../deployment"

/**
 * The branding a build takes when it is given none: a plain name, an
 * address that is nobody's, and no documents, for whoever serves the
 * software to replace with their own.
 */
export const DEPLOYMENT: Deployment = {
  name: "My Lens",
  nameInJapanese: "マイレンズ",
  pageTitle: "マイレンズ",
  description: "パチンコ・パチスロの収支をつける帳簿アプリ。データは端末の中に、会計は hledger で。",
  tagline: "パチンコ・パチスロの帳簿",
  indexed: false,
  themeColor: "#3f4451",
  address: "https://example.com/",
  landingPage: undefined,
  operatorPage: "https://example.com/",
}
