import type { ImportPorts } from "../application/import"
import type { ExportApp } from "../ui/export-app"
import { utf8Of, type ImportSource } from "../ui/import-source"
import { PACHIBO, type PachiboProblem } from "./pcb-import"
import { importPachibo, makeForPachiboCsv, makeForPachiboPcb, previewPachibo } from "./use-cases"
import { describePachiboProblem, IMPORT_CHOOSE_PCB, PACHIBO_NAME } from "./wording"

/** ぱち簿's import tab: its own file (`.pcb`), offered as any file, its name being one a phone's picker does not know. */
export const pachiboImport = (ports: ImportPorts): ImportSource<PachiboProblem> => ({
  from: PACHIBO,
  name: PACHIBO_NAME,
  about: "ぱち簿で書き出した pcb ファイルから、過去の収支を取り込みます。ぱち簿の CSV も汎用形式で取り込めますが、貯玉を使った日の現金の投資・回収や台番号・タグが入らないため、pcb ファイルでの取り込みをおすすめします。",
  kept: "店舗名・機種名・タグはぱち簿のまま残します。投資と回収は、貯玉と現金を合わせた額で取り込みます。同じファイルを2回選んでも、二重には入りません。貯玉の残高は取り込みません。",
  choose: IMPORT_CHOOSE_PCB,
  accept: undefined,
  asksUntagged: false,
  reading: { type: "bytes", preview: (bytes) => previewPachibo(ports, bytes, utf8Of) },
  take: (bookId, preview, named, weighing) => importPachibo(ports, bookId, preview, named, weighing),
  describe: describePachiboProblem,
})

/** ぱち簿's export tab: its CSV and its own file. */
export const PACHIBO_EXPORT: ExportApp = {
  format: PACHIBO,
  name: PACHIBO_NAME,
  about: "収支をぱち簿と同じ形の CSV と pcb ファイルに。投資・回収は現金として書き出します。pcb をぱち簿に取り込むと、ぱち簿にあった記録が置き換わる場合があるので、先にぱち簿で書き出しておいてください。",
  presses: [
    { label: "CSV", make: makeForPachiboCsv },
    { label: "pcb", make: makeForPachiboPcb },
  ],
}
