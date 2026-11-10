import type { ImportPorts } from "../application/import"
import type { ExportApp } from "../ui/export-app"
import type { ImportSource } from "../ui/import-source"
import { IMPORT_CHOOSE } from "../ui/import-wording"
import { MYPACHI, type MypachiProblem } from "./csv-import"
import { importMypachi, makeForMypachi, previewMypachi } from "./use-cases"
import { describeMypachiProblem, MYPACHI_NAME } from "./wording"

/** Myパチ収支表's import tab: its 件別収支表 as CSV, read as its bytes, Shift_JIS as it writes them. */
export const mypachiImport = (ports: ImportPorts): ImportSource<MypachiProblem> => ({
  from: MYPACHI,
  name: MYPACHI_NAME,
  about: "Myパチ収支表で書き出した件別収支表の CSV から、過去の収支を取り込みます。",
  kept: "店舗名・機種名はMyパチ収支表のまま、タグは空白で区切ってひとつずつ残します。期待値と稼働時間も取り込みます。同じファイルを2回選んでも、二重には入りません。",
  choose: IMPORT_CHOOSE,
  accept: ".csv,text/csv",
  asksUntagged: false,
  reading: { type: "bytes", preview: (bytes) => previewMypachi(ports, bytes) },
  take: (bookId, preview, named, weighing) => importMypachi(ports, bookId, preview, named, weighing),
  describe: describeMypachiProblem,
})

/** Myパチ収支表's export tab. */
export const MYPACHI_EXPORT: ExportApp = {
  format: MYPACHI,
  name: MYPACHI_NAME,
  about: "収支をMyパチ収支表の件別収支表と同じ形の CSV に。Myパチ収支表には取り込む機能がないため、見比べる用です。期待値は計測したもの、なければ推定期待値を書き出します。",
  presses: [{ label: "CSV", make: makeForMypachi }],
}
