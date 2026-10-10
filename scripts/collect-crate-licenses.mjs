// Collect the licence of every Rust crate that goes into an engine, and write
// it where the web app can display it.
//
// An engine is a wasm crate — crates/pachinko-wasm, crates/pachislot-wasm —
// compiled to WebAssembly, so what ships in the browser carries the licence of
// every crate linked into it. Nothing here is written by hand: the crate list
// is cargo's own resolution for the wasm target, walked out from the engine's
// crate along normal dependencies only — build scripts and tests build the
// engine but no part of them is served — and each licence is read from the
// crate itself.
//
// It needs cargo, so it is run when an engine is rebuilt
// (scripts/build-pachinko.sh, scripts/build-pachislot.sh) rather than on every
// web build. Its output is committed.
//
//   node scripts/collect-crate-licenses.mjs [ROOT_CRATE OUTPUT_NAME]
//   (the pachinko engine, pachinko-wasm into pachinko.json, when none is named)

import { execFileSync } from "node:child_process"
import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs"
import { dirname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"

const here = dirname(fileURLToPath(import.meta.url))
const repoRoot = resolve(here, "..")
const [ROOT_CRATE = "pachinko-wasm", OUTPUT_NAME = "pachinko"] = process.argv.slice(2)
const outPath = join(repoRoot, `apps/web/src/licenses/${OUTPUT_NAME}.json`)

const metadata = JSON.parse(
  execFileSync("cargo", ["metadata", "--format-version", "1", "--filter-platform", "wasm32-unknown-unknown", "--locked"], {
    cwd: repoRoot,
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  }),
)

const packages = new Map(metadata.packages.map((crate) => [crate.id, crate]))
const nodes = new Map(metadata.resolve.nodes.map((node) => [node.id, node]))

/** The dependencies a crate links in: normal ones, not those only for building or testing. */
const linkedDeps = (node) =>
  node.deps.filter((dep) => dep.dep_kinds.some((kind) => kind.kind === null)).map((dep) => dep.pkg)

const reachable = (id, found) => {
  if (found.has(id)) return found
  const node = nodes.get(id)
  return (node === undefined ? [] : linkedDeps(node)).reduce((sofar, dep) => reachable(dep, sofar), new Set(found).add(id))
}

/**
 * The licence a crate ships, as text. A crate offered under a choice of
 * licences ships one file per licence — LICENSE-MIT beside LICENSE-APACHE —
 * and all of them are what it grants, so all of them are kept.
 */
const licenceTextIn = (dir) => {
  const named = readdirSync(dir)
    .filter((file) => /^(LICEN[CS]E|COPYING|NOTICE)([-.]|$)/i.test(file))
    .sort()
  if (named.length === 0) return undefined
  return named.map((file) => `${named.length > 1 ? `${file}\n\n` : ""}${readFileSync(join(dir, file), "utf8").trim()}`).join("\n\n")
}

const copyrightIn = (text, authors) => {
  const line = text?.split(/\r?\n/).find((each) => /^\s*copyright\b.*(\(c\)|©|\d{4})/i.test(each))
  return line?.trim() ?? (authors.length > 0 ? authors.join(", ") : undefined)
}

const root = metadata.packages.find((crate) => crate.name === ROOT_CRATE)
if (root === undefined) {
  console.error(`${ROOT_CRATE} is not in the workspace.`)
  process.exit(1)
}

const credits = [...reachable(root.id, new Set())]
  .map((id) => packages.get(id))
  .filter((crate) => crate !== undefined)
  .map((crate) => {
    const local = crate.source === null
    const dir = dirname(crate.manifest_path)
    const text = local ? readFileSync(join(repoRoot, "LICENSE"), "utf8").trim() : licenceTextIn(dir)
    return {
      name: crate.name,
      version: crate.version,
      origin: local ? "local" : "crates",
      license: crate.license ?? undefined,
      copyright: local ? undefined : copyrightIn(text, crate.authors ?? []),
      homepage: crate.repository ?? crate.homepage ?? (local ? undefined : `https://crates.io/crates/${crate.name}/${crate.version}`),
      text,
    }
  })

// What is built from this repository first, then the crates behind it in the
// order a list of names is read in.
const rank = (entry) => (entry.origin === "local" ? 0 : 1)
const sorted = credits.sort((a, b) => rank(a) - rank(b) || a.name.localeCompare(b.name))

writeFileSync(outPath, `${JSON.stringify({ collected: new Date().toISOString().slice(0, 10), packages: sorted }, null, 2)}\n`)
const withText = sorted.filter((entry) => entry.text !== undefined).length
console.log(`${sorted.length} crates -> ${outPath} (${withText} with licence text)`)
