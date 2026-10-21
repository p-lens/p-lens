import type { HuddleStanding } from "../../core/huddle/standing"

/** What a huddle is called on screen. */
export const HUDDLE_HEADING = "ノリ打ち"

/** What a mark beside one of the others' plays in the day's list says of where it stands; nothing where it is being played. */
export const HUDDLE_STANDINGS: Readonly<Record<HuddleStanding, string | undefined>> = { finished: "終了", jackpot: "大当り中", rapid: "時短中", playing: undefined }

/** The mark of one of the others' plays they have left for another machine. */
export const HUDDLE_MOVED = "移動"

/** What is said over one of the others' plays, opened: it is theirs to write, and only to be looked at here. */
export const HUDDLE_WATCHING = "仲間の稼働です。見るだけで、ここからは書き込めません。"

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
