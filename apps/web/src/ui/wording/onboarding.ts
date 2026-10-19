/** The welcome's title, under the deployment's name. */
export const welcomeTitle = (name: string): string => `${name} へようこそ`

/** What the welcome says, a line a paragraph, short enough for a phone. */
export const WELCOME_LINES = ["パチンコ・パチスロの稼働を、その場で記帳する帳簿アプリです。", "まずはサンプル帳簿で、動かしてみましょう。"] as const

export const START_ALONE = "自分で始める"

export const MAKE_SAMPLE = "サンプルを作る"

/** Where the welcome is opened again from: the about panel's foot. */
export const WELCOME_AGAIN = "はじめに"
