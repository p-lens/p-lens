import type { ImportPorts } from "../application/import"
import type { ExportApp } from "../ui/export-app"
import type { ImportSource } from "../ui/import-source"
import { IMPORT_CHOOSE } from "../ui/import-wording"
import { PRECORD, type PrecordProblem } from "./csv-import"
import { importPrecord, makeForPrecord, previewPrecord } from "./use-cases"
import { describePrecordProblem, PRECORD_NAME } from "./wording"

/** pRecord's import tab: its CSV, weighed where a person asks, as its tallies say their hours. */
export const precordImport = (ports: ImportPorts): ImportSource<PrecordProblem> => ({
  from: PRECORD,
  name: PRECORD_NAME,
  about: "pRecord で書き出した CSV から、過去の収支を取り込みます。",
  kept: "店舗名・機種名は pRecord のまま残します。同じファイルを2回選んでも、二重には入りません。貯玉は取り込みません。",
  choose: IMPORT_CHOOSE,
  accept: ".csv,text/csv",
  asksUntagged: false,
  reading: { type: "named", preview: (text) => previewPrecord(ports, text) },
  take: (bookId, preview, named, weighing) => importPrecord(ports, bookId, preview, named, weighing),
  describe: describePrecordProblem,
})

/** pRecord's export tab. */
export const PRECORD_EXPORT: ExportApp = {
  format: PRECORD,
  name: PRECORD_NAME,
  about: "収支を pRecord が読める CSV に。pRecord の「その他 → データインポート」で取り込めます。",
  presses: [{ label: "CSV", make: makeForPrecord }],
}
