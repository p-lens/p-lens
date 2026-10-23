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
  description: "パチンコ・パチスロの収支を記録・管理するアプリ。データは端末の中に。",
  tagline: "パチンコ・パチスロの収支アプリ",
  indexed: false,
  themeColor: "#3f4451",
  address: "https://example.com/",
  landingPage: undefined,
  operatorPage: "https://example.com/",
}
