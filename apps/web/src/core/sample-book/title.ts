import { leadingGraphemesOf } from "../text/leading-graphemes"

/** What a sample book is called after its picture. */
const SAMPLE = "サンプル帳簿"

/** A sample book's title: the picture an unnamed book would be given — one no book there begins with — then サンプル帳簿. */
export const sampleTitleOf = (unnamed: string): string => `${leadingGraphemesOf(unnamed.trim(), 1)}${SAMPLE}`
