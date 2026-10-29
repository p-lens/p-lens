import { formatMoment } from "./dates"

/**
 * Said wherever something a person pressed could not reach a server for
 * want of a connection: no signal, one too weak to answer in time, or a
 * hall's Wi-Fi answering with its own login page in the server's place.
 * One wording for every server, so it reads the same whichever was asked,
 * and a timeout the same as no signal at all.
 */
export const NO_CONNECTION = "インターネットにつながりませんでした。電波のある所で、もう一度試してください。お店のWi-Fiにつないでいるなら、Wi-Fiのログインを済ませるか、Wi-Fiを切ってください。"

/** Said where a server answered that it failed itself: nothing the person did, and a later try goes through. */
export const SERVER_TROUBLE = "サーバが一時的に応えられませんでした。少し待って、もう一度試してください。"

/** Said where a server answered too often asked: a later try goes through. */
export const TOO_MANY_TRIES = "短い間に何度も送ったため、受け付けられませんでした。1分ほど待って、もう一度試してください。"

/** Said where a server would not take what this app sent, in a way no retry changes: an older app, most likely. */
export const NOT_TAKEN = "サーバが受け付けませんでした。アプリを最新にしてから、もう一度試してください。"

/** Why what is shown from a server is not up to date, in a word: no connection, the server failing itself, or anything else that kept it from being read. */
export type Unheard = "offline" | "server" | "other"

const UNHEARD_BECAUSE: Readonly<Record<Unheard, string>> = { offline: "つながらないため、", server: "サーバが応えないため、", other: "読み込めないため、" }

/** Said quietly beside what is shown from a server while it cannot be read: why, and as of when it is, or that it never was. */
export const notUpToDateText = (since: string | undefined, because: Unheard): string =>
  `${UNHEARD_BECAUSE[because]}${since === undefined ? "まだ読めていません" : `${formatMoment(since)} から更新できていません`}`

/** Said where a part of the app kept for use without signal could not be loaded: it comes over the network the first time, and is on the device after. */
export const ENGINE_UNLOADED = "計算に使う部品を読み込めませんでした。初めて使うときは電波が必要です。電波のある所でもう一度開くと、以後は電波がなくても使えます。"
