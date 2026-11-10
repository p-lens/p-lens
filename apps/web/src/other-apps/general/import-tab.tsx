import { createSignal, For, Index, Show, type JSX } from "solid-js"

import { Button } from "../../ui/primitives/button"
import { Select } from "../../ui/primitives/select"
import type { ImportPorts } from "../application/import"
import type { ColumnsProps, ImportSource } from "../ui/import-source"
import { IMPORT_CHOOSE } from "../ui/import-wording"
import { FIELDS, GENERAL, guessedMapping, missingOf, sheetOf, withColumn, type GeneralProblem } from "./csv-import"
import { importGeneral, previewGeneral } from "./use-cases"
import { describeGeneralProblem, FIELD_NAMES, GENERAL_NAME, IMPORT_NEXT, NOT_TAKEN } from "./wording"

/** How many of a sheet's rows are shown under each column's name, for the person to tell what the column holds. */
const SAMPLE_ROWS = 3

/** A cell shown as a sample: an empty one as two hyphens, so that it is seen to be empty. */
const sampleText = (cell: string | undefined): string => (cell === undefined || cell.trim() === "" ? "--" : cell)

/**
 * A sheet's columns, each by its name and the first rows under it, beside
 * the choice of the field it is taken in as — left out unless chosen, a
 * field chosen for one column taken from any other — and the press that
 * goes on with the mapping, which says what it still lacks rather than
 * going on without it.
 */
function ColumnsMapping(props: ColumnsProps): JSX.Element {
  const [lacking, setLacking] = createSignal(false)
  const missing = (): readonly ("date" | "sides")[] => missingOf(props.mapping)
  const options = [{ value: "none", label: NOT_TAKEN }, ...FIELDS.map((field) => ({ value: field, label: FIELD_NAMES[field] }))]
  return (
    <div class="flex flex-col gap-3 rounded-md border border-border px-3 py-2">
      <p class="text-sm text-text-primary">各列をどの項目として取り込むか選んでください</p>
      <ul class="flex flex-col gap-2">
        <Index each={Array.from({ length: props.sheet.width }, (_, index) => index)}>
          {(index) => (
            <li class="flex items-start gap-2 border-t border-border pt-2 first:border-t-0 first:pt-0">
              <div class="flex min-w-0 flex-1 flex-col">
                <span class="break-words text-sm font-medium text-text-primary">{props.sheet.header[index()] === undefined || props.sheet.header[index()] === "" ? `${index() + 1}列目` : props.sheet.header[index()]}</span>
                <For each={props.sheet.rows.slice(0, SAMPLE_ROWS)}>{(row) => <span class="truncate text-xs text-text-muted">{sampleText(row[index()])}</span>}</For>
              </div>
              <div class="w-40 shrink-0">
                <Select
                  label={`${props.sheet.header[index()] ?? `${index() + 1}列目`} の取り込み先`}
                  labelHidden
                  placeholder={NOT_TAKEN}
                  options={options}
                  value={props.mapping[index()] ?? "none"}
                  onChange={(value) => {
                    setLacking(false)
                    props.onMapping(withColumn(props.mapping, index(), FIELDS.find((field) => field === value)))
                  }}
                />
              </div>
            </li>
          )}
        </Index>
      </ul>
      <Show when={lacking() && missing().length > 0}>
        <p role="alert" class="text-xs text-negative">
          {describeGeneralProblem({ type: "unmapped", missing: missing() })}
        </p>
      </Show>
      <div class="flex justify-end">
        <Button
          size="small"
          onClick={() => {
            if (missing().length > 0) setLacking(true)
            else props.onNext()
          }}
        >
          {IMPORT_NEXT}
        </Button>
      </div>
    </div>
  )
}

/** 汎用形式's import tab: a person's own CSV, its columns tied to this app's fields, weighed where they ask, as its tallies say their hours. */
export const generalImport = (ports: ImportPorts): ImportSource<GeneralProblem> => ({
  from: GENERAL,
  name: GENERAL_NAME,
  about: "CSV の列を、どの項目として取り込むか選んで取り込みます。1行目は見出しとして読みます。",
  kept: "店舗名・機種名・タグはファイルのまま残します。「投資」と「回収」を選ぶと「収支」は使いません。同じファイルを2回選んでも、二重には入りません。",
  choose: IMPORT_CHOOSE,
  accept: ".csv,text/csv",
  asksUntagged: false,
  reading: { type: "mapped", sheet: sheetOf, guess: guessedMapping, Columns: ColumnsMapping, preview: (sheet, mapping) => previewGeneral(ports, sheet, mapping) },
  take: (bookId, preview, named, weighing) => importGeneral(ports, bookId, preview, named, weighing),
  describe: describeGeneralProblem,
})
