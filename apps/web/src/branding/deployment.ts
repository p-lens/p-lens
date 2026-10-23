/**
 * What a deployment goes by, who runs it, where it is, and where its
 * product is introduced at length. Each branding beside this file — a
 * folder of its own — says it for one deployment, and the build takes the
 * one `BRANDING` names: `default` when it names none, so a fork that never
 * looks here is served under no name but a plain one, never another's.
 */
export type Deployment = {
  /** Its name, as the top bar and every sentence that names it write it. */
  readonly name: string
  /** Its name as it is written in Japanese: what a home screen and an installed app are called. */
  readonly nameInJapanese: string
  /** What the page is called at `/`, the way in: a search's result. Every screen past it is called by `nameInJapanese` alone. */
  readonly pageTitle: string
  /** What it is, in a line, for whoever finds it by a search. */
  readonly description: string
  /** What it is, in a few words, for a card where a link to it is shared. */
  readonly tagline: string
  /** Whether search engines are let index it: a deployment someone has made their own, not a copy served as it came. */
  readonly indexed: boolean
  /** The colour a browser and an installed app draw their bars in. */
  readonly themeColor: string
  /** Its address, ending in a slash. */
  readonly address: string
  readonly landingPage: string | undefined
  /** Who runs it, as a page of theirs that says so and where they are written to. */
  readonly operatorPage: string
}
