/** What a huddle is called on screen, and the heading over the others' plays. */
export const HUDDLE_HEADING = "ノリ打ち"

/** What is said in a huddle while nobody else has shown a play. */
export const HUDDLE_WAITING = "仲間の稼働が届くのを待っています。"

/** When a play was last shown to the huddle. */
export const huddleShownAt = (moment: string): string => `${moment} 時点`

export const START_HUDDLE = "ノリ打ちを始める"
export const JOIN_HUDDLE = "QRコードで入る"
export const LEAVE_HUDDLE = "ノリ打ちを抜ける"
export const COPY_HUDDLE_CODE = "コードをコピー"
export const HUDDLE_CODE_COPIED = "コードをコピーしました"
export const JOIN_BY_CODE = "コードで入る"

/** The field a person says what they are called in a huddle with. */
export const HUDDLE_NAME = "表示名"

/** Why a huddle cannot be begun or joined yet: no name. */
export const HUDDLE_NAME_NEEDED = "表示名を入れてください。"

/** What the dialog says of a huddle before one is joined. */
export const HUDDLE_ABOUT = "同じ店で打つ仲間どうしで、いまの稼働を見せ合います。帳簿には何も書きません。その営業日が終わると閉じます。"

/** What the dialog says beside a huddle's QR code. */
export const HUDDLE_SHOW_CODE = "仲間にこのQRコードを読み取ってもらってください。ライブ計測でパチンコの稼働を開いている間、その稼働を見せ合います。"

/** What is said while the camera looks for a QR code. */
export const HUDDLE_SCANNING = "仲間の画面のQRコードを写してください。"

/** Why the camera could not be used to read a code. */
export const HUDDLE_NO_CAMERA = "カメラを使えませんでした。コードを貼り付けて入ってください。"

/** What a huddle's code is pasted into, where the camera is not used. */
export const HUDDLE_CODE_FIELD = "ノリ打ちのコード"

/** What the rail's button says while the device is in a huddle: who it is in it as. */
export const huddleJoinedAs = (name: string): string => `ノリ打ち中（${name}）`
