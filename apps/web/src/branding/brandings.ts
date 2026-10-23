import { fileURLToPath } from "node:url"

import { DEPLOYMENT as DEFAULT } from "./default/deployment"
import type { Deployment } from "./deployment"
import { DEPLOYMENT as P_LENS } from "./p-lens/deployment"

/**
 * The brandings a build may take, each a folder beside this file. `BRANDING`
 * names one — from the environment, or an `.env` file of the app — and a
 * build that names none takes `default`, a plain name for whoever serves a
 * copy, so nobody's name goes out on a copy by its being left alone.
 */
const BRANDINGS: Readonly<Record<string, Deployment>> = { default: DEFAULT, "p-lens": P_LENS }

/** The folder and the deployment `BRANDING` names; read by the build and the icons' script, never by the app. */
export const brandingOf = (named: string | undefined): { readonly folder: string; readonly deployment: Deployment } => {
  const chosen = named === undefined || named === "" ? "default" : named
  const deployment = BRANDINGS[chosen]
  if (deployment === undefined) throw new Error(`BRANDING names no branding in src/branding/: ${chosen}`)
  return { folder: fileURLToPath(new URL(`./${chosen}/`, import.meta.url)), deployment }
}
