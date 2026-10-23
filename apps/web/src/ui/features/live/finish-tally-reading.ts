import { bookNameOf, type MachineSummary } from "../../../core/catalog/catalog"
import type { TokenKind } from "../../../core/commodity/commodity"
import { parseDecimal, type Decimal } from "../../../core/decimal/decimal"
import type { NumericField } from "../../../core/tally/tally"
import { Err, Ok, type Result } from "../../../core/result/result"
import { tidyTyped } from "../../../core/text/tidy"
import type { ComboboxOption } from "../../primitives/combobox"

/** A field of a form a play followed live is recorded with. */
export type FormField = "date" | "parlor" | NumericField

export interface FieldProblem {
  readonly field: FormField
  readonly reason: "required" | "not-a-number" | "not-a-date"
}

export type Read<T> = Result<T, FieldProblem>

export const problemOf = (read: Read<unknown>): readonly FieldProblem[] => (read.ok ? [] : [read.error])

/** A theoretical figure left empty was not worked out, which is not the same as zero. */
export const readOptionalYen = (text: string, field: NumericField): Read<Decimal | undefined> => {
  if (tidyTyped(text) === "") return Ok(undefined)
  const parsed = parseDecimal(tidyTyped(text))
  return parsed.ok ? parsed : Err({ field, reason: "not-a-number" })
}

/** What a play followed live comes to by its log, for recording it: yen spent, tokens drawn from savings, the tokens it was begun with in hand, the tokens in hand at its last line, its theoretical value and — a pachinko play's — the spin performance it measured, each where the log says. */
export interface PlayedSoFar {
  readonly outlay: number | undefined
  readonly replay: number | undefined
  readonly carriedIn: number | undefined
  readonly held: number | undefined
  readonly theoreticalValue: number | undefined
  readonly spinPerformance: number | undefined
}

/** What the tokens in hand are called where they are typed, for each kind of token: those a play was begun with — brought from the play before — and those in hand as it finished, which are what it leaves. */
export const IN_HAND_LABELS: Readonly<Record<TokenKind, { readonly carriedIn: string; readonly left: string }>> = {
  ball: { carriedIn: "開始時の持ち玉", left: "持ち玉" },
  medal: { carriedIn: "開始時の持ちメダル", left: "持ちメダル" },
}

/** What a form's button says, says while it is at work, and what is said once it is done. */
export interface SubmitWords {
  readonly idle: string
  readonly busy: string
  readonly done: string
}

/** A play recorded for the first time. */
export const RECORDING: SubmitWords = { idle: "記録する", busy: "記録中…", done: "収支を記帳しました" }

/** A play of the day whose tally the book already has, recorded again from its readings as they now are. */
export const RECORDING_AGAIN: SubmitWords = { idle: "記帳し直す", busy: "記帳中…", done: "記帳し直しました" }

/** What leads from a play just recorded to its tally in the book, offered for a moment and gone. */
export const SEE_IN_BOOK = "帳簿で見る"

/**
 * The machines the play may name, each by the name the halls call it: the
 * catalog's of its game, and — where the catalog lacks it — the one it was
 * followed on. Never one typed.
 */
export const machineChoicesOf = (machines: readonly MachineSummary[], held: string): readonly ComboboxOption[] => {
  const listed = machines.map((machine) => ({ value: bookNameOf(machine), label: machine.name, ...(machine.hitChance === undefined ? {} : { note: machine.hitChance }) }))
  return held.trim() === "" || listed.some((option) => option.value === held) ? listed : [{ value: held, label: held }, ...listed]
}
