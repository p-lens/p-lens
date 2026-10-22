import type { HuddleStanding } from "../../core/huddle/standing"

/** What a huddle is called on screen. */
export const HUDDLE_HEADING = "ノリ打ち"

/** What a mark beside one of the others' plays in the day's list says of where it stands; nothing where it is being played. */
export const HUDDLE_STANDINGS: Readonly<Record<HuddleStanding, string | undefined>> = { finished: "終了", jackpot: "大当り中", rapid: "時短中", playing: undefined }

/** The room on the rail, with how many of the others are in a jackpot where any are. */
export const huddleRoomLabel = (inJackpot: number): string => (inJackpot === 0 ? HUDDLE_HEADING : `${HUDDLE_HEADING}（大当り中 ${inJackpot} 人）`)

/** The room's words: who one is among its members, the total of their plays, the way to narrow them, to one's own alone, and the code to show. */
export const HUDDLE_OWN = "自分"
export const HUDDLE_TOTAL = "メンバー合算"
export const HUDDLE_NARROW = "メンバーで絞り込む"
export const HUDDLE_OWN_ONLY = "自分のみ"
export const HUDDLE_CODE = "QRコード"
export const HUDDLE_SETTLE = "精算する"
export const HUDDLE_SETTLEMENT = "精算"

/** A member as the room's filter offers them: one's own name said as one's own. */
export const roomMemberText = (name: string, own: boolean): string => (own ? `${HUDDLE_OWN}（${name}）` : name)

/** The mark of one of the others' plays they have left for another machine. */
export const HUDDLE_MOVED = "移動済"

/** The mark of the play one of the others is on where they have said nothing for long: nothing typed in, not that they left. */
export const HUDDLE_IDLE = "動きなし"

/** The mark of the play one of the others was on as they left the huddle. */
export const HUDDLE_DEPARTED = "離脱"

/** Letting one of the others' plays go from this device's list: what its cross is called, what is asked, and what is said of it. */
export const HUDDLE_DISMISS = "一覧から消す"
export const HUDDLE_DISMISS_ASK = "この稼働を一覧から消しますか？"
export const HUDDLE_DISMISS_SAYS = "この端末の一覧から消すだけで、仲間の記録はそのまま残ります。元には戻せません。"

/** What giving up one's own play says in a huddle: the others let it go too. */
export const HUDDLE_GIVEN_UP = "ノリ打ちの仲間の画面からも消えます。"

/** When a play was last shown to the huddle. */
export const huddleShownAt = (moment: string): string => `${moment} 時点`

export const START_HUDDLE = "ノリ打ちを始める"
export const JOIN_HUDDLE = "QRコードで入る"
export const LEAVE_HUDDLE = "ノリ打ちを抜ける"
export const JOIN_BY_IMAGE = "画像から読み取る"

/** The field a person says what they are called in a huddle with. */
export const HUDDLE_NAME = "表示名"

/** Why a huddle cannot be begun or joined yet: no name. */
export const HUDDLE_NAME_NEEDED = "表示名を入れてください。"

/** What the dialog says of a huddle before one is joined. */
export const HUDDLE_ABOUT = "同じ店で打つ仲間どうしで、いまの稼働を見せ合います。帳簿には何も書きません。その営業日が終わると閉じます。"

/** What the dialog says beside a huddle's QR code. */
export const HUDDLE_SHOW_CODE = "仲間にこのQRコードを読み取ってもらってください。スクリーンショットを送っても読み取れます。その日の稼働を、ライブ計測の「本日の稼働」で見せ合います。"

/** What is said while the camera looks for a QR code. */
export const HUDDLE_SCANNING = "仲間の画面のQRコードを写してください。"

/** Why the camera could not be used to read a code. */
export const HUDDLE_NO_CAMERA = "カメラを使えませんでした。QRコードのスクリーンショットを「画像から読み取る」で選んでください。"

/** Why an image chosen to join by gave no huddle. */
export const HUDDLE_NOT_IN_IMAGE = "画像からQRコードを読み取れませんでした。QRコード全体が写った画像を選んでください。"

/** What the button to a huddle says while the device is in one, before the name it is in it as, which is shown in brackets after. */
export const HUDDLE_JOINED = "ノリ打ち中"
