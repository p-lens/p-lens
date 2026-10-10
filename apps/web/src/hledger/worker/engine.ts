import { ConsoleStdout, Directory, File, OpenFile, PreopenDirectory, WASI } from "@bjorn3/browser_wasi_shim"

import type { Request, Trouble } from "../protocol/wire"
import ghcJsffi from "./ghc-jsffi.mjs"

interface Exports {
  hs_init(argc: number, argv: number): void
  hledgerLoad(path: string): Promise<string>
  hledgerQuery(request: string): Promise<string>
}

/** What the engine answers before any id is put on it. */
export type EngineReply =
  | { readonly ok: true; readonly value: unknown }
  | { readonly ok: false; readonly trouble: Trouble }

/**
 * One running hledger, holding one parsed journal.
 *
 * Effects only: the module is compiled by whoever starts it, so the worker can
 * fetch it and a test can read it off disk.
 */
export interface Engine {
  readonly open: (files: Readonly<Record<string, string>>, entry: string) => Promise<EngineReply>
  readonly query: (request: Request) => Promise<EngineReply>
}

type Entry = readonly [string, File | Directory]

/**
 * The files as the folders their names say they are in. The shim walks a path
 * one folder at a time, so `pachinko-play/a.jsonl` has to be a file inside `pachinko-play`.
 */
const treeOf = (files: readonly (readonly [string, string])[]): readonly Entry[] => {
  const encoder = new TextEncoder()
  const here = files.filter(([path]) => !path.includes("/"))
  const below = files.filter(([path]) => path.includes("/"))
  const folders = [...new Set(below.map(([path]) => path.slice(0, path.indexOf("/"))))]
  return [
    ...here.map(([name, contents]): Entry => [name, new File(encoder.encode(contents))]),
    ...folders.map((folder): Entry => [
      folder,
      new Directory(
        new Map(
          treeOf(
            below
              .filter(([path]) => path.startsWith(`${folder}/`))
              .map(([path, contents]) => [path.slice(folder.length + 1), contents] as const),
          ),
        ),
      ),
    ]),
  ]
}

/** Open the envelope the bindings wrap every answer in. */
const openEnvelope = (raw: string): EngineReply => {
  try {
    const parsed = JSON.parse(raw) as { ok: boolean; data?: unknown; error?: Trouble }
    return parsed.ok
      ? { ok: true, value: parsed.data }
      : { ok: false, trouble: parsed.error ?? { kind: "unreadable-answer", detail: "no error given" } }
  } catch (cause) {
    return { ok: false, trouble: { kind: "unreadable-answer", detail: String(cause) } }
  }
}

const unreachable = (cause: unknown): EngineReply => ({ ok: false, trouble: { kind: "unreachable", detail: String(cause) } })

/**
 * Start hledger with a filesystem to read journals from.
 *
 * hledger's text entry point needs a pipe WASI does not have, and going through
 * a filesystem lets `include` resolve itself. Its own stdout and stderr go
 * nowhere: everything it has to say comes back in the answer it belongs to.
 */
export const startEngine = async (module: WebAssembly.Module): Promise<Engine> => {
  const directory = new Map<string, File | Directory>()
  const wasi = new WASI(
    [],
    [],
    [
      new OpenFile(new File([])),
      ConsoleStdout.lineBuffered(() => {}),
      ConsoleStdout.lineBuffered(() => {}),
      new PreopenDirectory("/", directory),
    ],
    { debug: false },
  )
  const exported: Record<string, unknown> = {}
  const instance = await WebAssembly.instantiate(module, {
    wasi_snapshot_preview1: wasi.wasiImport,
    ghc_wasm_jsffi: ghcJsffi(exported),
  })
  Object.assign(exported, instance.exports)
  wasi.initialize(instance as never)
  const hledger = instance.exports as unknown as Exports
  hledger.hs_init(0, 0)

  const replaceFiles = (files: Readonly<Record<string, string>>): void => {
    directory.clear()
    treeOf(Object.entries(files)).forEach(([name, entry]) => directory.set(name, entry))
  }

  return {
    open: (files, entry) => {
      replaceFiles(files)
      return hledger.hledgerLoad(entry).then(openEnvelope, unreachable)
    },
    query: (request) => hledger.hledgerQuery(JSON.stringify(request)).then(openEnvelope, unreachable),
  }
}
