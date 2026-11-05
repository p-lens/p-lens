import type { InvitedRole, Joined, MemberRole } from "../../crossing"
import { titleText } from "./book"

/** What the sharing screen says first: what sharing is, that a code is made for each person, and that the relay reads nothing. */
export const SHARING_INTRO = "帳簿をほかの人に見せたり、一緒に記録したり、稼働を送ってもらったりできます。招待する人ごとに招待コードを作って、その人に渡してください。帳簿も稼働も端末の中で暗号化してから送るので、中継サーバは中身を読めません。"

export const OWN_BOOKS_TO_SHARE = "自分の帳簿"
export const BOOKS_LET_INTO = "招待された帳簿"
export const JOIN_SHARED_HEADING = "招待コードで追加"

/** Said as a book's inbox is added as somewhere this device sends plays to: where to send from. */
export const joinedInboxText = (joined: Extract<Joined, { readonly type: "inbox" }>): { readonly title: string; readonly description: string } => ({
  title: "稼働の送り先を追加しました",
  description: `ライブ計測で稼働を開き、紙ヒコーキから「${titleText(joined.title)}」に送れます。`,
})

/** What joining by an invitation code says: a book one was let into, or a book's inbox to send plays to. */
export const JOIN_SHARED = {
  about: "帳簿の持ち主から受け取った招待コードのQRコードを読み取るか、コードを貼り付けてください。稼働の送り先として招待されたときも、ここで追加します。同じコードで、自分のほかの端末にも追加できます。",
  field: "招待コード",
  scanning: "招待コードのQRコードを写してください。",
  notInImage: "画像の中に招待コードのQRコードが見つかりませんでした。",
  joined: (joined: Joined) => (joined.type === "book" ? { title: "招待された帳簿を追加しました" } : joinedInboxText(joined)),
  notJoined: "追加できませんでした",
} as const

export const OPEN_MEMBERS = "招待・外す"
export const CLOSE_MEMBERS = "閉じる"
export const PREPARING_SHARING = "準備しています…"
export const SHARING_NOT_STARTED = "共有を始められませんでした"
export const LINE_NOT_OPEN = "中継サーバにつないでいます。少し待ってから開き直してください。"

/** What a person the owner invited may do, in a word, as the owner reads it. */
export const roleText = (role: InvitedRole): string => ({ editor: "編集", viewer: "閲覧", sender: "送信" })[role]

/** What a person let into a book may do, as they read it of a book they were let into. */
export const letInAsText = (role: MemberRole): string => ({ editor: "記録もできます", viewer: "見るだけです" })[role]

export const ROLE_ABOUT = "閲覧は見るだけ、編集は記録もできます。送信は帳簿を見られず、自分の稼働を送るだけです。"
export const NO_MEMBERS = "まだだれも招待していません。"
export const INVITEE_NAME = "招待する人の名前"
export const ROLE_LABEL = "権限"
export const MAKE_INVITATION = "招待コードを作る"
export const MAKING_INVITATION = "作成中…"
export const INVITATION_NOT_MADE = "招待コードを作れませんでした"
export const SHOW_INVITATION = "コード"

/** The dialog a person's code is shown in: its title, what to do with it, and the warning it carries. */
export const invitationTitle = (name: string): string => `${name}さんの招待コード`
export const INVITATION_HOW = "相手に「設定 → 帳簿の共有」を開いてもらい、このQRコードを読み取ってもらってください。離れているときは、文面をコピーして送ってください。"
export const invitationWarning = (role: InvitedRole): string =>
  `このコードは、この人専用です。持っている人はだれでも、この人としてこの帳簿${({ editor: "を見て、記録できます", viewer: "を見られます", sender: "に稼働を送れます" })[role]}。`
export const COPY_INVITATION = "文面をコピー"
export const INVITATION_COPIED = "招待の文面をコピーしました"
export const INVITATION_NOT_COPIED = "コピーできませんでした"
export const CLOSE_INVITATION = "閉じる"

/**
 * What an owner sends a person with their code: which app's book they are
 * let into and as what, the steps that put it on their device, the code on
 * a line of its own, and that it is theirs alone. Written to be pasted into
 * a chat as it is.
 */
export const invitationMessage = (app: string, title: string, role: InvitedRole, code: string): string =>
  [
    role === "sender" ? `${app} の帳簿「${title}」に、稼働を送れるように招待します。` : `${app} の帳簿「${title}」に招待します（${letInAsText(role)}）。`,
    "",
    "1. アプリの 設定 → 帳簿の共有 を開く",
    "2.「招待コードで追加」に下のコードを貼る",
    "3.「この端末に追加」を押す",
    ...(role === "sender" ? ["4. ライブ計測で稼働を開き、紙ヒコーキを押す"] : []),
    "",
    code,
    "",
    "このコードはあなた専用です。ほかの人に渡さないでください。",
  ].join("\n")

/** The words of taking a person out of a book: the question, what it is told will happen, and the buttons. */
export const removeWording = (name: string, role: InvitedRole): { readonly question: string; readonly body: string; readonly confirm: string; readonly decline: string } => ({
  question: `${name}さんを帳簿から外しますか？`,
  body:
    role === "sender"
      ? "この人から送られる稼働を、これ以降受け取りません。記帳した分は帳簿に残ります。"
      : "この人には、これ以降の変更が届かなくなり、帳簿に書くこともできなくなります。すでに受け取った分は、相手の端末に残ります。外すと帳簿の鍵を作り直し、ほかの人と自分の端末は自動でつなぎ直します。",
  confirm: "外す",
  decline: "やめる",
})

export const REMOVE = "外す"
export const REMOVING = "外しています…"
export const removedText = (name: string): string => `${name}さんを外しました`
export const notRemovedText = (name: string): string => `${name}さんを外せませんでした`

/** The words of leaving a book one was let into: the button, the question, what it is told will happen, and the buttons. */
export const leaveWording = (title: string): { readonly question: string; readonly body: string; readonly confirm: string; readonly decline: string } => ({
  question: `「${title}」から抜けますか？`,
  body: "この端末の帳簿は、今のままの写しとして残ります。このあとの変更は届かず、この端末で書いたことも相手に届きません。写しが要らなければ、「帳簿の管理」で削除できます。帳簿の持ち主には知らされないので、外してもらうよう伝えてください。",
  confirm: "抜ける",
  decline: "やめる",
})

export const LEAVE = "抜ける"
export const LEFT_BOOK = "帳簿から抜けました"
export const NOT_LEFT = "帳簿から抜けられませんでした"

/** Said as the owner takes this device's person out of a book. */
export const REMOVED_FROM_BOOK = { title: "帳簿の共有から外されました", description: "この端末の帳簿は、外されたときのまま残ります。" } as const

/** Said of a book let into whose two sides would not merge, where this device may not choose: the owner, or an editor, does. */
export const CONFLICT_WAITS = "食い違いがあります。帳簿の持ち主か、編集できる人が直すのを待っています。"

/** Said as the owner takes this device's person out of sending plays to a book. */
export const removedFromSendingText = (title: string): string => `「${titleText(title)}」への稼働の送信から外されました`

export const DESTINATIONS_HEADING = "稼働の送り先"
export const DESTINATIONS_ABOUT = "ライブ計測で稼働を開き、紙ヒコーキを押すと送れます。相手の帳簿の中身は、この端末からは見えません。"
export const DESTINATION_REMOVED = "外されました"
export const SENDING_COUNT = (count: number): string => `${count}件の稼働を送っています`

/** The words of letting a book one sends plays to go: the question, what it is told will happen, and the buttons. */
export const forgetDestinationWording = (title: string): { readonly question: string; readonly body: string; readonly confirm: string; readonly decline: string } => ({
  question: `「${title}」を送り先から外しますか？`,
  body: "この端末から、この送り先を外します。送った稼働は、その日のうちは持ち主の端末に残ります。持ち主には知らされないので、外してもらうよう伝えてください。",
  confirm: "外す",
  decline: "やめる",
})

export const FORGET_DESTINATION = "外す"
export const DESTINATION_FORGOTTEN = "送り先から外しました"
export const DESTINATION_NOT_FORGOTTEN = "送り先から外せませんでした"
