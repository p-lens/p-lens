/**
 * A document the deployment puts before people beside the app: the terms
 * it is used under, and what is done with what people give it. The app has
 * a place for each; what they say is whoever runs the deployment's to
 * write, and not the app's.
 */
export const DOCUMENT_KINDS = ["terms", "privacy"] as const

export type DocumentKind = (typeof DOCUMENT_KINDS)[number]

export const isDocumentKind = (value: string): value is DocumentKind => DOCUMENT_KINDS.some((kind) => kind === value)

/** The documents a deployment supplies, each as the text it was written in; one it does not supply is absent. */
export type Documents = Readonly<Partial<Record<DocumentKind, string>>>

/** A stretch of a document: a heading at its depth, a paragraph, or a list of items. */
export type Block =
  | { readonly type: "heading"; readonly level: 1 | 2 | 3; readonly text: string }
  | { readonly type: "paragraph"; readonly text: string }
  | { readonly type: "list"; readonly items: readonly string[] }

const HEADING = /^(#{1,3})\s+(.*)$/

const ITEM = /^-\s+(.*)$/

const levelOf = (marks: string): 1 | 2 | 3 => (marks.length === 1 ? 1 : marks.length === 2 ? 2 : 3)

/** One block of a document's text, the lines between two blank ones: a heading, a list where every line is an item, or else a paragraph of its lines joined. */
const blockOf = (lines: readonly string[]): Block => {
  const heading = lines.length === 1 ? HEADING.exec(lines[0] ?? "") : null
  if (heading !== null) return { type: "heading", level: levelOf(heading[1] ?? "#"), text: (heading[2] ?? "").trim() }
  const items = lines.map((line) => ITEM.exec(line)?.[1]?.trim())
  return items.every((item) => item !== undefined) ? { type: "list", items: items.flatMap((item) => (item === undefined ? [] : [item])) } : { type: "paragraph", text: lines.join("") }
}

/**
 * A document's text read into its blocks. It is written plainly — `#`
 * headings to three deep, `-` lists, and paragraphs, each set off by a
 * blank line — so whoever runs a deployment can write one without the app
 * knowing a markup language.
 */
export const blocksOf = (text: string): readonly Block[] =>
  text
    .split(/\n\s*\n/)
    .map((block) => block.split("\n").map((line) => line.trim()).filter((line) => line !== ""))
    .filter((lines) => lines.length > 0)
    .map(blockOf)
