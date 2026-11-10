import type { ImportPorts } from "../application/import"
import type { ExportApp } from "../ui/export-app"
import type { ImportSource } from "../ui/import-source"
import { MAXBET, type MaxbetProblem } from "./tags"
import { importMaxbet, makeForMaxbet, previewMaxbet } from "./use-cases"
import { describeMaxbetProblem, IMPORT_CHOOSE_FILE, MAXBET_NAME } from "./wording"

/** MAXBET's import tab: its backup or its CSV, its tallies that say no game taken in only where the person ticks for them. */
export const maxbetImport = (ports: ImportPorts): ImportSource<MaxbetProblem> => ({
  from: MAXBET,
  name: MAXBET_NAME,
  about: "MAXBET で書き出したバックアップ（JSON）か CSV から、過去の収支を取り込みます。パチンコ・パチスロのタグで種別を分けます。CSV には MAXBET の画面で絞り込んだ収支しか出ないことがあるため、バックアップでの取り込みをおすすめします。",
  kept: "パチンコ・パチスロ以外のタグとメモは MAXBET のまま残します。バックアップと CSV のどちらから取り込んでも、同じ収支は二重には入りません。",
  choose: IMPORT_CHOOSE_FILE,
  accept: ".json,.csv,application/json,text/csv",
  asksUntagged: true,
  reading: { type: "named", preview: (text) => previewMaxbet(ports, text) },
  take: (bookId, preview, named) => importMaxbet(ports, bookId, preview, named),
  describe: describeMaxbetProblem,
})

/** MAXBET's export tab: its backup. */
export const MAXBET_EXPORT: ExportApp = {
  format: MAXBET,
  name: MAXBET_NAME,
  about: "収支を MAXBET のバックアップと同じ形の JSON に。タグは書き出しません。店舗・機種は MAXBET にないため書き出しません。MAXBET に取り込むと、MAXBET にあった記録が置き換わる場合があるので、先に MAXBET でバックアップしておいてください。",
  presses: [{ label: "JSON", make: makeForMaxbet }],
}
