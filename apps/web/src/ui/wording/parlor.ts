import type { SharedParlor } from "../../core/parlor/shared"
import type { Parlor } from "../../core/parlor/parlor"
import { tierOf, type PlayTerms } from "../../core/parlor/terms"
import type { PlayGameKind } from "../../core/play/play"

/** A play's parlor by name, or the words for having none. */
export const parlorText = (parlor: Parlor | undefined): string => parlor?.name ?? "店舗名なし"

const TOKENS: Readonly<Record<PlayGameKind, string>> = { pachinko: "玉", slot: "枚" }

/** A corner's terms in a line: what ¥1,000 rents and is exchanged for, and what a replay pays out and takes. */
const termsText = (gameKind: PlayGameKind, terms: PlayTerms): string =>
  `貸${TOKENS[gameKind]} ${String(terms.rental.tokens)}・交換 ${String(terms.exchange.tokens)}・再プレイ ${String(terms.replay.paidOut)}/${String(terms.replay.deducted)}`

/** The rate a play was on, as one fact of it: the corner's advertised rate, then its terms. */
export const rateText = (gameKind: PlayGameKind, terms: PlayTerms): string => `${tierOf(gameKind, terms)}（${termsText(gameKind, terms)}）`

/** A distance as a person reads it: metres up close, kilometres beyond. */
export const distanceText = (metres: number): string =>
  metres < 1000 ? `${String(Math.round(metres / 10) * 10)}m` : metres < 10_000 ? `${(metres / 1000).toFixed(1)}km` : `${String(Math.round(metres / 1000))}km`

/** What a parlor the list has not placed on the map is marked with. */
const UNPLACED = "座標未確認"

/**
 * What a list to choose from says of a parlor beside its name: how far it
 * is once the device says where it is, its prefecture until then, and that
 * the list has not placed it — it has no distance to give.
 */
export const parlorNote = (parlor: Pick<SharedParlor, "prefecture" | "location">, metres: number | undefined): string => {
  if (parlor.location === undefined) return `${parlor.prefecture}・${UNPLACED}`
  return metres === undefined ? parlor.prefecture : distanceText(metres)
}

/** What a person is asked under a parlor the list has not placed, leading to where its position is reported. */
export const LOCATE_REQUEST = "店舗座標の登録にご協力下さい"

/** What a typed name stops, by where it was typed: starting a play, adding one to a book by hand, recording one that was followed live, or registering savings. */
export type TypedNameRefused = "starting" | "adding" | "recording" | "registering"

const REFUSED: Readonly<Record<TypedNameRefused, string>> = { starting: "稼働できません", adding: "追加できません", recording: "記録できません", registering: "登録できません" }

/** What is said under the parlor field while it holds a name that was typed and chose no parlor: nothing is done on one. */
export const typedParlorRefused = (doing: TypedNameRefused): string => `手入力の店舗名では${REFUSED[doing]}。帳簿上どうしても店舗名を入れたい場合は、プラスボタンから店舗登録にご協力ください。`

/** What is said under the machine field while it holds a name that was typed and chose no machine: a play names a machine of the catalog, or none. */
export const typedMachineRefused = (doing: TypedNameRefused): string => `手入力の機種名では${REFUSED[doing]}。機種名を入れたい場合は、プラスボタンから機種と算出条件を登録してください。`
