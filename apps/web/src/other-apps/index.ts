/**
 * 他アプリ連携, the other apps a book's tallies are taken in from and
 * written out for: a person's own file (汎用形式), pRecord, ぱち簿, MAXBET
 * and パチフォリオ, a folder each, holding all of that app's — its files
 * read and written (`csv-import`, `pcb-export`, …), its use cases, its tabs
 * and its words — so that a change an app makes to its files is a change
 * to its folder alone. What they share — a tally as another app kept it,
 * a CSV read and written, the taking in and the writing out, the screens
 * of インポート and エクスポート, a book's download — is beside them, in `core/`,
 * `application/` and `ui/`. The app reaches it only through this index.
 */
export type { ExportPorts } from "./application/export"
export { BookDownload } from "./ui/BookDownload"
export { ExportSettings } from "./ui/ExportSettings"
export { ImportSettings } from "./ui/ImportSettings"
export { sourceName } from "./ui/app-names"
