import { ConsoleStdout, Directory, File, OpenFile, PreopenDirectory, WASI } from "@bjorn3/browser_wasi_shim"

import type { Request, Trouble } from "../protocol/wire"
import ghcJsffi from "./ghc-jsffi.mjs"

interface Exports {
  hs_init(argc: number, argv: number): void
  hledgerLoad(path: string, key: string): Promise<string>
  hledgerSelect(key: string): Promise<string>
  hledgerQuery(request: string): Promise<string>
}

/** What the engine answers before any id is put on it. */
export type EngineReply =
  | { readonly ok: true; readonly value: unknown }
  | { readonly ok: false; readonly trouble: Trouble }

/**
 * One running hledger, asking of one parsed journal at a time and keeping a
 * few read lately, so a journal opened again is not parsed again — and the
 * answers it gave lately, so a question asked again is not answered again.
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

/**
 * The key a journal read from these files is kept under: a digest of them
 * and of the one read first. The same files give the same key, and any
 * change to any of them another.
 */
const keyOf = async (files: Readonly<Record<string, string>>, entry: string): Promise<string> => {
  const written = JSON.stringify([entry, Object.entries(files).toSorted(([left], [right]) => left.localeCompare(right))])
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(written)))
  return [...digest].map((byte) => byte.toString(16).padStart(2, "0")).join("")
}

/**
 * How much of hledger's answers are kept, in characters as they came: the
 * reports of several screens of a dozen books, a few megabytes in all.
 */
const ANSWERS_KEPT = 20_000_000

/** An answer kept: what it was, and how large it came. */
interface KeptAnswer {
  readonly reply: EngineReply
  readonly size: number
}

/**
 * The key an answer is kept under: the journal asked, the day it was asked
 * on — a report of an open period may end today — and the question.
 */
const answerKeyOf = (journal: string, request: Request): string => `${journal}\n${new Date().toDateString()}\n${JSON.stringify(request)}`

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

  /**
   * The journal questions are asked of, by its key, and the answers given
   * lately, newest last: a journal does not change under its key, so the
   * same question of it is answered as it was before, with no report made.
   */
  const held: { journal: string | undefined; answers: Map<string, KeptAnswer>; size: number } = { journal: undefined, answers: new Map(), size: 0 }

  /** An answer kept, and the oldest let go of while those kept come to more than `ANSWERS_KEPT`, the newest kept however large. */
  const remember = (key: string, raw: string, reply: EngineReply): void => {
    held.answers.set(key, { reply, size: raw.length })
    held.size += raw.length
    for (const [gone, answer] of held.answers) {
      if (held.size <= ANSWERS_KEPT || held.answers.size <= 1) return
      held.answers.delete(gone)
      held.size -= answer.size
    }
  }

  const opened = (key: string, reply: EngineReply): EngineReply => {
    if (reply.ok) held.journal = key
    return reply
  }

  return {
    open: async (files, entry) => {
      const key = await keyOf(files, entry)
      const kept = await hledger.hledgerSelect(key).then(openEnvelope, unreachable)
      if (kept.ok) return opened(key, kept)
      replaceFiles(files)
      return opened(key, await hledger.hledgerLoad(entry, key).then(openEnvelope, unreachable))
    },
    query: async (request) => {
      const key = held.journal === undefined ? undefined : answerKeyOf(held.journal, request)
      const kept = key === undefined ? undefined : held.answers.get(key)
      if (kept !== undefined) return kept.reply
      const raw = await hledger.hledgerQuery(JSON.stringify(request)).catch((cause: unknown) => cause)
      if (typeof raw !== "string") return unreachable(raw)
      const reply = openEnvelope(raw)
      if (reply.ok && key !== undefined) remember(key, raw, reply)
      return reply
    },
  }
}
