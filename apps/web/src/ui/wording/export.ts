import type { ExportReport } from "../../application/export"
import { formatCount } from "./numbers"

/** A file asked for and not yet begun on: its book still waiting its turn. */
export const EXPORT_BEGUN = "書き出し中…"

/** How far making a file has got, as a person is told while it is made. */
export const exportReportText = (report: ExportReport): string => {
  switch (report.type) {
    case "reading":
      return "帳簿を読み込み中…"
    case "totalling":
      return "収支を集計中…"
    case "book":
      return `書き出し中… ${formatCount(report.done)}/${formatCount(report.of)}冊`
    case "packing":
      return "zip にまとめています…"
  }
}

/** A file made too long after its press for the device to take it without another: it waits for the person's own press. */
export const EXPORT_READY = "ファイルができました。"

/** The press a made file is handed over on. */
export const EXPORT_SAVE = "保存"

/** The press a file being made is stopped on. */
export const EXPORT_STOP = "中止"

/** A file being handed over: the device asking the person where it goes. */
export const EXPORT_HANDING = "保存しています…"

/** A writing out that broke off with nothing said of why: it can be pressed again. */
export const EXPORT_BROKEN = "書き出せませんでした。もう一度押してください。"
