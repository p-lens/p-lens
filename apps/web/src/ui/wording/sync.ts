import type { SyncProblem } from "../../application/errors"
import type { Synced } from "../../application/sync"
import type { InvitedRole } from "../../core/sync/invitation"
import type { Side } from "../../core/sync/merge"

/** Why a book could not be synced or joined, as a person is told. */
export const describeSyncProblem = (problem: SyncProblem): string => {
  switch (problem.type) {
    case "unreachable":
      return "中継サーバにつながりませんでした。通信状況を確かめて、もう一度試してください。"
    case "behind":
    case "unsettled":
      return "ほかの端末の変更が続いていて、同期が追いつきませんでした。少し待ってもう一度試してください。"
    case "line-missing":
    case "nothing-to-join":
      return "この同期コードの帳簿は、まだ中継サーバに送られていません。元の端末で一度同期してから試してください。"
    case "shut-out":
      return "この帳簿を開けません。共有を外されたか、コードが違います。"
    case "not-permitted":
      return "この帳簿では、その操作は許されていません。"
    case "too-many":
      return "同期が多すぎます。1分ほど待ってください。"
    case "refused":
      return `中継サーバに断られました。（${problem.status} ${problem.reason}）`
    case "bad-secret":
    case "not-a-pairing-code":
      return "同期コード・招待コードとして読めません。もらったコードをそのまま貼り付けてください。"
    case "unreadable-box":
    case "unreadable-change":
      return "受け取った変更を開けませんでした。同期コードが違うか、データが壊れています。"
    case "sealing-unavailable":
      return `この端末では暗号化を使えません。（${problem.detail}）`
    case "diverged":
      return `この端末の帳簿が履歴と合っていません（${problem.path}）。同期を続けられません。`
    case "line-broken":
      return `中継サーバにある変更がつながっていません（${problem.path}）。同期を続けられません。`
    case "conflict":
      return `この端末とほかの端末が、同じ箇所を別々に書き換えています（${problem.path}）。下で残すほうを選んでください。`
    case "links":
      return `同期の設定を端末に残せませんでした: ${problem.detail}`
    case "not-linked":
      return "この帳簿は同期していません。"
    case "no-relay":
      return "このアプリには中継サーバが設定されていません。"
    case "book-here":
      return "この帳簿はすでにこの端末にあります。"
  }
}

/** How a round of syncing went, in a line. */
export const syncedText = (synced: Synced): string =>
  synced.received === 0 && synced.sent === 0 ? "最新です。" : `受け取り ${synced.received} 件・送信 ${synced.sent} 件。`

/** Whose lines a side of a conflict is. */
export const sideName = (side: Side): string => (side === "ours" ? "この端末" : "ほかの端末")

/** What a person let into a book may do, as it is said in a line: on the owner's list, and to the person themselves. */
export const roleText = (role: InvitedRole): string => ({ editor: "編集", viewer: "閲覧", sender: "送信だけ" })[role]

const INVITED_AS: Readonly<Record<InvitedRole, string>> = { editor: "記録もできます", viewer: "見るだけです", sender: "稼働を送れます" }

/** What a person does once the book, or the way to send to it, is on their device: nothing more for one who reads or writes it, and where the sending is done for one who sends. */
const AFTER_JOINING: Readonly<Record<InvitedRole, readonly string[]>> = {
  editor: [],
  viewer: [],
  sender: ["4.「本日の稼働」で、送りたい稼働の紙ヒコーキを押す"],
}

/**
 * What an owner sends a person with their code: which app's book they are let into and
 * as what, the steps that put it on their device, the code on a line of its
 * own, and that it is theirs alone. Written to be pasted into a chat as it
 * is.
 */
export const invitationMessage = (app: string, title: string, role: InvitedRole, code: string): string =>
  [
    `${app} の帳簿「${title}」に招待します（${INVITED_AS[role]}）。`,
    "",
    "1. アプリの 設定 → 同期 を開く",
    "2.「コードで帳簿を追加」に下のコードを貼る",
    "3.「この端末に追加」を押す",
    ...AFTER_JOINING[role],
    "",
    code,
    "",
    "このコードはあなた専用です。ほかの人に渡さないでください。",
  ].join("\n")
