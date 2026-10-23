import type { SharedParlor } from "../../core/parlor/shared"
import type { Parlor } from "../../core/parlor/parlor"
import { statedExchangeOf, tierOf, type PlayTerms } from "../../core/parlor/terms"
import type { PlayGameKind } from "../../core/play/play"
import { seal, veil, type Secret } from "../../mummer"

/** A parlor's name, sealed where it comes to the words: where a person plays is the first thing 配信モード veils. */
export type ParlorName = Secret<"parlor", string>

/** What stands for a parlor's name while it is veiled: one shape, whatever the name, so that its length tells nothing. */
const VEILED_NAME = "••••店"

/** What stands for where a parlor is — its prefecture, how far it is — while its name is veiled. */
const VEILED_WHERE = "--"

/** A parlor's name as a screen shows it. */
export const parlorNameText = (name: ParlorName): string => veil.text(name, (shown) => shown, VEILED_NAME)

/**
 * A parlor's name in a list to choose one from: veiled as many characters
 * long as it is, so that the one a person stands in, nearest first, can
 * still be told from those beside it.
 */
export const parlorChoiceText = (name: ParlorName): string => veil.text(name, (shown) => shown, "•".repeat(veil.length(name, (shown) => [...shown].length, [...VEILED_NAME].length)))

/** What is said under the field a play's parlor is chosen in while parlors are veiled: choose before the stream, and the day keeps it. */
const CHOOSE_BEFORE = "配信モード中は店舗名を伏せています。配信前に一度選んでおくと、その日は選んだままになります。"

/** What is said under the field a play's parlor is chosen in: nothing, unless parlors are veiled. */
export const parlorChoiceNote = (): string => veil.text(seal.parlor(""), () => "", CHOOSE_BEFORE)

/** What a field a parlor is chosen in holds once one is chosen, to tell a choice from a name typed and choosing nothing: its label in the list, veiled as the list veils it. */
export const chosenParlorText = (name: string | undefined): string | undefined => (name === undefined ? undefined : parlorChoiceText(seal.parlor(name)))

/** A play's parlor by name, or the words for having none. */
export const parlorText = (parlor: Parlor | undefined): string => (parlor === undefined ? "店舗名なし" : parlorNameText(seal.parlor(parlor.name)))

const TOKENS: Readonly<Record<PlayGameKind, string>> = { pachinko: "玉", pachislot: "枚" }

/** A corner's terms in a line: what ¥1,000 rents, the exchange as the game states it, and what a replay pays out and takes. */
const termsText = (gameKind: PlayGameKind, terms: PlayTerms): string =>
  `貸${TOKENS[gameKind]} ${String(terms.rental.tokens)}・交換 ${statedExchangeOf(gameKind, terms.exchange)}・再プレイ ${String(terms.replay.paidOut)}/${String(terms.replay.deducted)}`

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
export const parlorNote = (parlor: Pick<SharedParlor, "prefecture" | "location">, metres: number | undefined): string => parlorPlaceText(placeOf(parlor, metres))

/** Where a parlor is — its address, its prefecture, how far it is — as a screen shows it: veiled with its name. */
export const parlorPlaceText = (place: string): string => veil.text(seal.parlor(place), (shown) => shown, VEILED_WHERE)

const placeOf = (parlor: Pick<SharedParlor, "prefecture" | "location">, metres: number | undefined): string => {
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

/** What is said under the machine field while it holds a name that was typed and chose no machine: a tally names a machine of the catalog, or none. */
export const typedMachineRefused = (doing: TypedNameRefused): string => `手入力の機種名では${REFUSED[doing]}。一覧から選ぶか、指定しないままにしてください。`
