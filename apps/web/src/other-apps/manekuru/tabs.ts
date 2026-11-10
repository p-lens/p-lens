import type { ImportPorts } from "../application/import"
import type { ExportApp } from "../ui/export-app"
import type { ImportSource } from "../ui/import-source"
import { IMPORT_CHOOSE } from "../ui/import-wording"
import { MANEKURU, type ManekuruProblem } from "./csv-import"
import { importManekuru, makeForManekuru, previewManekuru } from "./use-cases"
import { describeManekuruProblem, MANEKURU_NAME } from "./wording"

/** マネクルSP's import tab: its CSV, weighed where a person asks, as its tallies say their minutes. */
export const manekuruImport = (ports: ImportPorts): ImportSource<ManekuruProblem> => ({
  from: MANEKURU,
  name: MANEKURU_NAME,
  about: "マネクルSP の CSV から、過去の収支を取り込みます。",
  kept: "店舗名・機種名はマネクルSP のまま、投資種類とタグはタグとして残します。期待値は、収支と同じ額（みなし期待値）でないものだけ取り込みます。同じファイルを2回選んでも、二重には入りません。",
  choose: IMPORT_CHOOSE,
  accept: ".csv,text/csv",
  asksUntagged: false,
  reading: { type: "named", preview: (text) => previewManekuru(ports, text) },
  take: (bookId, preview, named, weighing) => importManekuru(ports, bookId, preview, named, weighing),
  describe: describeManekuruProblem,
})

/** マネクルSP's export tab. */
export const MANEKURU_EXPORT: ExportApp = {
  format: MANEKURU,
  name: MANEKURU_NAME,
  about: "収支をマネクルSP が読める CSV に。マネクルSP の「設定 → CSVインポート」で取り込めます。期待値は計測したもの、なければ推定期待値を書き出します。",
  presses: [{ label: "CSV", make: makeForManekuru }],
}
