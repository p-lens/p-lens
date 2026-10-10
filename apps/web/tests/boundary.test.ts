import { describe, expect, test } from "bun:test"
import { readdir, readFile } from "node:fs/promises"

const WEB = new URL("../", import.meta.url).pathname
const SHELL = new URL("../../../packages/solid-gathering-shell/src/", import.meta.url).pathname

const sourcesUnder = async (directory: string): Promise<readonly string[]> =>
  (await readdir(directory, { recursive: true }))
    .filter((path) => /\.(ts|tsx)$/.test(path))
    .map((path) => `${directory}${path}`)

const importsOf = async (path: string): Promise<readonly string[]> =>
  [...(await readFile(path, "utf8")).matchAll(/^\s*import[^"']*["']([^"']+)["']/gm)].map((found) => found[1] ?? "")

/** Every import from the files under `directory` that `forbidden` matches, as `file -> import`. */
const offending = async (directory: string, forbidden: RegExp): Promise<readonly string[]> => {
  const files = await sourcesUnder(directory)
  const found = await Promise.all(
    files.map(async (file) => (await importsOf(file)).filter((name) => forbidden.test(name)).map((name) => `${file.replace(WEB, "")} -> ${name}`)),
  )
  return found.flat()
}

describe("dependency direction", () => {
  test("only the pachinko engine's worker loads its engine", async () => {
    const loaders = (await Promise.all(["app", "application", "core", "ui", "hledger", "catalog", "pachinko-engine/client"].map((layer) => offending(`${WEB}src/${layer}/`, /@p-lens\/pachinko-engine/)))).flat()
    expect(loaders).toEqual([])
  })

  test("only the reasoner's worker loads Prolog", async () => {
    const loaders = (await Promise.all(["app", "application", "core", "ui", "hledger", "catalog", "pachinko-engine", "pachislot-engine", "reasoning/client", "reasoning/protocol", "reasoning/pachinko", "reasoning/pachislot"].map((layer) => offending(`${WEB}src/${layer}/`, /^trealla/)))).flat()
    expect(loaders).toEqual([])
  })

  test("only the pachislot engine's worker loads its engine", async () => {
    const loaders = (await Promise.all(["app", "application", "core", "ui", "hledger", "catalog", "pachinko-engine", "reasoning", "pachislot-engine/client"].map((layer) => offending(`${WEB}src/${layer}/`, /@p-lens\/pachislot-engine/)))).flat()
    expect(loaders).toEqual([])
  })

  test("neither game imports the other", async () => {
    const packagesOf = (game: string): readonly string[] => [`core/${game}`, `application/${game}`, `${game}-engine`, `ui/features/${game}`, `ui/wording/${game}`]
    const crossing = async (game: string, other: string): Promise<readonly string[]> =>
      (await Promise.all(packagesOf(game).map((layer) => offending(`${WEB}src/${layer}/`, new RegExp(`(^|/)${other}(-engine)?(/|$)`))))).flat()
    expect([...(await crossing("pachinko", "pachislot")), ...(await crossing("pachislot", "pachinko"))]).toEqual([])
  })

  test("the core imports no framework, no browser adapter and nothing above it", async () => {
    expect(await offending(`${WEB}src/core/`, /^solid-js|^@kobalte|^@solidjs|\/(application|ui|app|storage|history|sync|pwa)\/|hledger\/(client|worker|query)/)).toEqual([])
  })

  test("the core reaches hledger through its wire types only", async () => {
    expect(await offending(`${WEB}src/core/`, /hledger\/protocol\/(?!wire$)/)).toEqual([])
  })

  test("the application knows ports, never a concrete adapter or a screen", async () => {
    expect(await offending(`${WEB}src/application/`, /^solid-js|^@kobalte|\/(ui|app|pwa)\/|storage\/browser|history\/adapters|hledger\/worker/)).toEqual([])
  })

  test("screens reach storage and hledger only through the application, naming at most a port's types", async () => {
    expect(
      await offending(`${WEB}src/ui/`, /\/(app|pwa)\/|storage\/(?!port\/)|history\/(?!port\/)|hledger\/(client|worker)|pachinko-engine\/worker|reasoning\/(worker|pachinko)|sync\/(http|local|web-crypto)|(?<!core\/)backup\/(?!port\/)|preferences\/local|pachislot-engine\/worker|(?<!core\/)(catalog|parlors)\/(local|jsonl|absent|http|delivered)|location\/browser|@p-lens\/pachinko-engine/),
    ).toEqual([])
  })

  test("only the composition names what is the deployment's own: its documents come to the screens through the services", async () => {
    const outside = (await Promise.all(["application", "core", "ui", "catalog", "storage", "sync", "backup"].map((layer) => offending(`${WEB}src/${layer}/`, /\/branding\//)))).flat()
    expect(outside).toEqual([])
  })

  test("only the composition names concrete adapters", async () => {
    const outside = (
      await Promise.all(
        ["application", "core", "ui", "hledger", "sync/port", "backup/port", "preferences/port", "pachinko-engine", "catalog/port", "parlors/port", "pachislot-engine"].map((layer) =>
          offending(`${WEB}src/${layer}/`, /storage\/browser|history\/adapters|(?<!core\/)(catalog|parlors)\/(local|jsonl|absent|http|delivered)|sync\/(http|local|web-crypto)|(?<!core\/)backup\/(zip|google-drive|browser|web-crypto|local)|preferences\/local|location\/browser/),
        ),
      )
    ).flat()
    expect(outside).toEqual([])
  })

  test("backing up knows a book's files and nothing of what the book is about", async () => {
    const files = [...(await sourcesUnder(`${WEB}src/backup/`)), ...(await sourcesUnder(`${WEB}src/core/backup/`)), `${WEB}src/application/backup.ts`]
    const texts = await Promise.all(files.map((file) => readFile(file, "utf8")))
    expect(files.filter((_, index) => /pachinko|pachislot|p-lens|parlor|\bplays?\b|catalog/i.test(texts[index] ?? ""))).toEqual([])
  })

  test("only the Google Drive adapter knows Google", async () => {
    const files = (await sourcesUnder(`${WEB}src/`)).filter((file) => !file.includes("/backup/google-drive/") && !file.includes("/app/composition/") && !file.includes("/ui/wording/") && !file.includes("/generated/"))
    const texts = await Promise.all(files.map((file) => readFile(file, "utf8")))
    expect(files.filter((_, index) => /googleapis|accounts\.google|gsi\/client/i.test(texts[index] ?? ""))).toEqual([])
  })

  test("no screen ever shows the not-allowed cursor", async () => {
    const styled = async (directory: string): Promise<readonly string[]> =>
      (await readdir(directory, { recursive: true })).filter((path) => /\.(ts|tsx|css)$/.test(path)).map((path) => `${directory}${path}`)
    const files = [...(await styled(`${WEB}src/`)), ...(await styled(SHELL))]
    const texts = await Promise.all(files.map((file) => readFile(file, "utf8")))
    expect(files.filter((_, index) => /not-allowed|no-drop/.test(texts[index] ?? ""))).toEqual([])
  })

  test("no screen turns a control off: a press that cannot go ahead nudges what it waits on", async () => {
    const files = (await readdir(`${WEB}src/ui/features/`, { recursive: true })).filter((path) => path.endsWith(".tsx")).map((path) => `${WEB}src/ui/features/${path}`)
    const texts = await Promise.all(files.map((file) => readFile(file, "utf8")))
    expect(files.filter((_, index) => /\sdisabled[={\s]/.test(texts[index] ?? ""))).toEqual([])
  })

  test("the shell package knows nothing of P-Lens", async () => {
    const files = await sourcesUnder(SHELL)
    const texts = await Promise.all(files.map((file) => readFile(file, "utf8")))
    const domainWords = /pachinko|p-lens|ledger|parlor|\bplayer\b|\bparent\b|\bchild\b|\bboss\b|discord|mastodon/i
    expect(files.filter((_, index) => domainWords.test(texts[index] ?? ""))).toEqual([])
    expect((await Promise.all(files.map(importsOf))).flat().filter((name) => !name.startsWith(".") && name !== "solid-js")).toEqual([])
  })
})
