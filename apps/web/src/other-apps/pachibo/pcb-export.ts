import type { IsoDate } from "../../core/calendar/calendar"
import { LABEL_BITS, PACHISLOT_CODES_FROM } from "./pcb-import"
import type { PlayId } from "../../core/play/play"
import type { TallyLine } from "../../core/report/tally-line"
import type { ClockTime } from "../../core/tally/tally"
import { wholeSidesOf } from "../core/whole-sides"
import { minutesOf, oldestFirst } from "./lines"

/** Bytes of a text as UTF-8: given from outside, where the platform has an encoder. */
export type Utf8Writer = (text: string) => Uint8Array

/** A value of ぱち簿's file, by the type it is written as. */
type Value = readonly [type: "Boolean" | "Integer" | "Long" | "String", key: string, value: string]

const truth = (key: string, value: boolean): Value => ["Boolean", key, String(value)]

const whole = (key: string, value: number): Value => ["Integer", key, String(value)]

const long = (key: string, value: number): Value => ["Long", key, String(value)]

const text = (key: string, value: string): Value => ["String", key, value]

/** The codes this app gives the parlors and machines of a file it writes, from where ぱち簿's own are not known to go: a parlor's, a pachinko machine's and a pachislot machine's. */
const CODES_FROM = { parlor: 990_001, pachinko: 9_001, pachislot: PACHISLOT_CODES_FROM + 9_001 } as const

/** What ぱち簿 writes for a code or a time not given. */
const UNSAID = -1

/** A machine as ぱち簿 keeps it apart: its name and its game, a machine of no known game kept among pachinko's. */
const machineKeyOf = (line: TallyLine): string | undefined => (line.machineName === undefined || line.machineName === "" ? undefined : `${line.tally.gameKind === "pachislot" ? "pachislot" : "pachinko"}\u001f${line.machineName}`)

/** Codes for the names given, in their order, counted on from the first. */
const codesOf = (names: readonly string[], from: number): ReadonlyMap<string, number> => new Map([...new Set(names)].map((name, index) => [name, from + index]))


/** A day as ぱち簿's keys write it, `20261104`, and as a whole number where it says a day. */
const keyDayOf = (date: IsoDate): string => date.replaceAll("-", "")

/** A time on a clock as ぱち簿 keeps it, `1940` for 19:40, or none where it is not known. */
const clockKept = (time: ClockTime | undefined): number => (time === undefined ? UNSAID : time.hour * 100 + time.minute)

/** A length as ぱち簿 keeps it beside no clock, hours and minutes: `905` for nine hours and five minutes; none where not known. */
const lengthKept = (minutes: number | undefined): number => (minutes === undefined ? 0 : Math.floor(minutes / 60) * 100 + (minutes % 60))

/** A tally's labels as ぱち簿's bits, those it has words for; others are not its and are left out. */
const bitsOf = (labels: readonly string[]): number => LABEL_BITS.reduce((bits, label, bit) => (labels.includes(label) ? bits + 2 ** bit : bits), 0)

/** A cabinet as ぱち簿 keeps it, a whole number; none, `0`, where it is not one. */
const cabinetKept = (cabinet: string | undefined): number => (cabinet !== undefined && /^\d{1,9}$/.test(cabinet.trim()) ? Number(cabinet.trim()) : 0)

const itemValues = (key: string, line: TallyLine, memo: string, parlor: number, machine: number): readonly Value[] => {
  const sides = wholeSidesOf(line)
  const clock = line.notes.aside.clock
  const timed = clock?.started !== undefined && clock.finished !== undefined
  return [
    whole(`${key}_hall_id`, parlor),
    whole(`${key}_machine_id`, machine),
    whole(`${key}_type`, 1),
    whole(`${key}_invest`, Number(sides.outlay.mantissa)),
    whole(`${key}_invest2`, 0),
    truth(`${key}_invest_store`, false),
    truth(`${key}_invest_cash`, false),
    whole(`${key}_invest_conversion`, 0),
    whole(`${key}_recovery`, Number(sides.takings.mantissa)),
    whole(`${key}_recovery2`, 0),
    truth(`${key}_recovery_store`, false),
    truth(`${key}_recovery_cash`, false),
    whole(`${key}_recovery_conversion`, 0),
    whole(`${key}_start`, timed ? clockKept(clock.started) : UNSAID),
    whole(`${key}_end`, timed ? clockKept(clock.finished) : UNSAID),
    whole(`${key}_time`, timed ? 0 : lengthKept(minutesOf(line.notes.playSeconds))),
    whole(`${key}_number`, cabinetKept(line.tally.cabinetNumber)),
    whole(`${key}_tag`, bitsOf(line.labels)),
    whole(`${key}_tag_count`, 0),
    whole(`${key}_image_count`, 0),
    text(`${key}_memo`, memo),
  ]
}

const parlorValues = (code: number, name: string): readonly Value[] => [
  text(`hall${String(code)}_name`, name),
  text(`hall${String(code)}_address`, ""),
  ...["pachi", "slot"].flatMap((game) => [
    truth(`hall${String(code)}_invest_store_${game}`, false),
    whole(`hall${String(code)}_invest_conversion_${game}`, 0),
    truth(`hall${String(code)}_recovery_store_${game}`, false),
    whole(`hall${String(code)}_recovery_conversion_${game}`, 0),
    whole(`hall${String(code)}_savings_${game}`, 0),
  ]),
]

/** The exchange rates ぱち簿 offers when it is new, in hundredths of yen a token: medals' first, then balls'. */
const CONVERSIONS: readonly (readonly [type: number, value: number])[] = [
  [1, 2000],
  [1, 2127],
  [1, 500],
  [0, 400],
  [0, 357],
  [0, 100],
  [0, 93],
]

/** What ぱち簿 keeps of itself beside the tallies, as a file of its own has it when it is new. */
const settingValues = (madeAt: number, first: IsoDate | undefined, last: IsoDate | undefined): readonly Value[] => [
  long("first", madeAt),
  ...(first === undefined ? [] : [whole("first_result", Number(keyDayOf(first)))]),
  ...(last === undefined ? [] : [whole("last_result", Number(keyDayOf(last)))]),
  whole("conversion_count", CONVERSIONS.length),
  ...CONVERSIONS.flatMap(([type, value], index) => [whole(`conversion${String(index)}_type`, type), whole(`conversion${String(index)}_value`, value)]),
  whole("analysis_mode", 3),
  whole("analysis_sort_dir", 0),
  whole("analysis_sort_type", 1),
  text("calendar_bg", "none"),
  text("calendar_item", "machine"),
  truth("graph", true),
  text("graph_type", "10"),
  whole("hall_database", 3),
  whole("machine_database", 8),
  text("list_bg", "image"),
  truth("pachinko", true),
  truth("slot", true),
  truth("show_recovery", true),
  whole("style", 0),
  text("time_unit", "1"),
]

/** Values as ぱち簿 writes them one after another, `type,key,length,value,`, each value's length in characters. */
const pcbTextOf = (values: readonly Value[]): string => values.map(([type, key, value]) => `${type},${key},${String([...value].length)},${value},`).join("")

/**
 * Tallies as the file ぱち簿 writes and takes back whole (`.pcb`): every
 * tally by its day and its place in the day, oldest first, its two sides
 * in yen as cash put in and cash taken back — savings none, a tally kept
 * in yen moving none — with its hours, its cabinet, its memo and those of
 * its labels ぱち簿 has words for; each parlor and machine named once,
 * under a code this app gives it where ぱち簿's own are not known to go,
 * and nothing under one where a tally names none; and ぱち簿's own settings
 * as a new file of its has them. Each byte of the text is turned over, as
 * ぱち簿 writes them. Taken in by ぱち簿, it stands in for all ぱち簿 kept.
 */
export const pachiboPcbOf = (lines: readonly TallyLine[], notes: ReadonlyMap<PlayId, string>, madeAt: number, utf8: Utf8Writer): Uint8Array => {
  const ordered = oldestFirst(lines)
  const parlors = codesOf(
    ordered.flatMap((line) => (line.parlorName === undefined || line.parlorName === "" ? [] : [line.parlorName])),
    CODES_FROM.parlor,
  )
  const keys = ordered.flatMap((line) => ((key) => (key === undefined ? [] : [key]))(machineKeyOf(line)))
  const machines = new Map([...codesOf(keys.filter((key) => !key.startsWith("pachislot")), CODES_FROM.pachinko), ...codesOf(keys.filter((key) => key.startsWith("pachislot")), CODES_FROM.pachislot)])
  const days = ordered.reduce((byDay, line) => byDay.set(line.tally.date, [...(byDay.get(line.tally.date) ?? []), line]), new Map<IsoDate, readonly TallyLine[]>())
  const items = [...days].flatMap(([date, ofDay]) => [
    whole(`item${keyDayOf(date)}_count`, ofDay.length),
    ...ofDay.flatMap((line, index) =>
      itemValues(`item${keyDayOf(date)}_${String(index)}`, line, notes.get(line.tally.id) ?? "", parlors.get(line.parlorName ?? "") ?? UNSAID, ((key) => (key === undefined ? UNSAID : (machines.get(key) ?? UNSAID)))(machineKeyOf(line))),
    ),
  ])
  const makers = new Map(ordered.toReversed().flatMap((line) => ((key) => (key === undefined || line.maker === undefined || line.maker === "" ? [] : [[key, line.maker] as const]))(machineKeyOf(line))))
  const machineValues = [...machines].flatMap(([key, code]) => [text(`machine${String(code)}_name`, key.slice(key.indexOf("\u001f") + 1)), text(`machine${String(code)}_maker`, makers.get(key) ?? ""), text(`machine${String(code)}_comment`, "")])
  const lists = [
    ...[...parlors.values()].flatMap((code, index) => [whole(`halllist${String(index + 1)}_id`, code), long(`halllist${String(index + 1)}_date`, madeAt)]),
    ...[...machines.values()].flatMap((code, index) => [whole(`machinelist${String(index + 1)}_id`, code), long(`machinelist${String(index + 1)}_date`, madeAt)]),
  ]
  const values = [...settingValues(madeAt, ordered[0]?.tally.date, ordered.at(-1)?.tally.date), ...[...parlors].flatMap(([name, code]) => parlorValues(code, name)), ...machineValues, ...lists, ...items]
  return utf8(pcbTextOf(values)).map((byte) => 255 - byte)
}
