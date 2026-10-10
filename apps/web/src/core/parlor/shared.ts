import type { SubmissionId } from "./parlor"

export type SharedParlorId = string & { readonly __brand: "SharedParlorId" }

/** Every prefecture, north to south, as a parlor's address names it. */
export const PREFECTURES = [
  "北海道",
  "青森県",
  "岩手県",
  "宮城県",
  "秋田県",
  "山形県",
  "福島県",
  "茨城県",
  "栃木県",
  "群馬県",
  "埼玉県",
  "千葉県",
  "東京都",
  "神奈川県",
  "新潟県",
  "富山県",
  "石川県",
  "福井県",
  "山梨県",
  "長野県",
  "岐阜県",
  "静岡県",
  "愛知県",
  "三重県",
  "滋賀県",
  "京都府",
  "大阪府",
  "兵庫県",
  "奈良県",
  "和歌山県",
  "鳥取県",
  "島根県",
  "岡山県",
  "広島県",
  "山口県",
  "徳島県",
  "香川県",
  "愛媛県",
  "高知県",
  "福岡県",
  "佐賀県",
  "長崎県",
  "熊本県",
  "大分県",
  "宮崎県",
  "鹿児島県",
  "沖縄県",
] as const

export type Prefecture = (typeof PREFECTURES)[number]

export const isPrefecture = (text: string): text is Prefecture => (PREFECTURES as readonly string[]).includes(text)

/**
 * What a parlor's name cannot hold, since a book writes it as it is into an
 * account and a commodity: `:` would make a sub-account, two spaces or a tab
 * end an account name, a quote ends the commodity, and `,`, `;` or a line
 * break end a tag, start a comment or end the line.
 */
const UNWRITABLE_NAME = /[:",;\n\r\t]| {2}/

export const isWritableParlorName = (name: string): boolean => !UNWRITABLE_NAME.test(name)

/** Where a place is on the earth, in degrees. */
export interface Coordinates {
  readonly latitude: number
  readonly longitude: number
}

/**
 * A parlor from the parlor list — JSONL published at parlors.p-lens.jp
 * from a repository of its own, under the ODbL — its name, how it is read,
 * the other words people find it by, where it is, and the submissions it was
 * made from. A play chooses one; one that is not listed is submitted. A
 * parlor the list knows of but has not yet placed on the map has an address
 * and no position, until someone reports one at survey.p-lens.jp.
 */
export interface SharedParlor {
  readonly id: SharedParlorId
  readonly name: string
  /** The name as it is read, in hiragana. */
  readonly reading: string
  /** Other words it is searched by: D station, Dステ. */
  readonly keywords: readonly string[]
  readonly prefecture: Prefecture
  readonly address: string
  readonly location: Coordinates | undefined
  /** The submissions this parlor was made from, by which a play waiting on one finds it. */
  readonly submissions: readonly SubmissionId[]
}

/** A submission the list will not take, and why, as the list says it. */
export interface Rejection {
  readonly submission: SubmissionId
  readonly reason: string | undefined
}

/** Everything the parlor list publishes: its parlors, and the submissions it turned down. */
export interface ParlorList {
  readonly parlors: readonly SharedParlor[]
  readonly rejections: readonly Rejection[]
}

export const EMPTY_PARLOR_LIST: ParlorList = { parlors: [], rejections: [] }

/** Parlors in the order a list shows them: prefecture north to south, then name. */
export const inDirectoryOrder = (parlors: readonly SharedParlor[]): readonly SharedParlor[] =>
  parlors.toSorted(
    (left, right) => PREFECTURES.indexOf(left.prefecture) - PREFECTURES.indexOf(right.prefecture) || left.name.localeCompare(right.name, "ja"),
  )
