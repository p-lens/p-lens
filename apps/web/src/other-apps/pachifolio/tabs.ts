import type { ImportPorts } from "../application/import"
import type { ExportApp } from "../ui/export-app"
import type { ImportSource } from "../ui/import-source"
import { IMPORT_CHOOSE } from "../ui/import-wording"
import { PACHIFOLIO, type PachifolioProblem } from "./csv-import"
import { importPachifolio, makeForPachifolio, previewPachifolio } from "./use-cases"
import { describePachifolioProblem, PACHIFOLIO_NAME } from "./wording"

/** パチフォリオ's import tab: its CSV. */
export const pachifolioImport = (ports: ImportPorts): ImportSource<PachifolioProblem> => ({
  from: PACHIFOLIO,
  name: PACHIFOLIO_NAME,
  about: "パチフォリオで書き出した CSV から、過去の収支を取り込みます。",
  kept: "店舗名・機種名・タグはパチフォリオのまま残します。回転数・大当りも取り込みます。パチンコの回転数は、確変・時短中を除いた通常時の回転数として取り込みます。同じファイルを2回選んでも、二重には入りません。",
  choose: IMPORT_CHOOSE,
  accept: ".csv,text/csv",
  asksUntagged: false,
  reading: { type: "named", preview: (text) => previewPachifolio(ports, text) },
  take: (bookId, preview, named) => importPachifolio(ports, bookId, preview, named),
  describe: describePachifolioProblem,
})

/** パチフォリオ's export tab. */
export const PACHIFOLIO_EXPORT: ExportApp = {
  format: PACHIFOLIO,
  name: PACHIFOLIO_NAME,
  about: "収支をパチフォリオと同じ形の CSV に。回転数・大当りはライブ計測で記帳した収支のものを書き出します。パチンコの回転数は、確変・時短中を除いた通常時の回転数です。",
  presses: [{ label: "CSV", make: makeForPachifolio }],
}
