import type { LineKeep, SealedCommitDto } from "@p-lens/contracts/relay"

import { Err, Ok, collect, mapErr, mapOk, type Result } from "../core/result/result"
import type { Packer } from "../sync/port/packer"
import type { LineAccess, Relay } from "../sync/port/relay"
import type { LineKeys, Sealer } from "../sync/port/sealer"
import type { Outcome, SyncProblem } from "./errors"

/**
 * What a line carrying entries rather than a book's commits reaches: the
 * relay it is on, the sealing of each entry, and the packing that keeps a
 * play shown again and again small. A huddle's line and a book's plays'
 * lines are both such lines.
 */
export interface SealedLinePorts {
  readonly relay: Relay
  readonly sealer: Sealer
  readonly packer: Packer
}

/** One line: where it is on its relay, and the key its entries are sealed with. */
export interface SealedLine {
  readonly access: LineAccess
  readonly keys: LineKeys
}

/** What a line has given since a place on it: where it ends, and each entry this app reads, at the place the relay put it. */
interface SealedLineRead<E> {
  readonly head: number
  readonly entries: readonly { readonly seq: number; readonly entry: E }[]
}

const fromSync = <T>(result: Result<T, SyncProblem>): Outcome<T> => mapErr(result, (found) => ({ type: "sync", problem: found }))

const sealedEntry = async (ports: Pick<SealedLinePorts, "sealer" | "packer">, line: SealedLine, commitId: string, text: string): Promise<Outcome<SealedCommitDto>> =>
  mapOk(fromSync(await ports.sealer.seal(line.keys, commitId, ports.packer.pack(text))), (box) => ({ commitId, box }))

/** Entries as they go on a line: each packed, and sealed under the commit id it is given. */
export const sealedEntries = async (ports: Pick<SealedLinePorts, "sealer" | "packer">, line: SealedLine, entries: readonly { readonly commitId: string; readonly text: string }[]): Promise<Outcome<readonly SealedCommitDto[]>> =>
  collect(await Promise.all(entries.map(({ commitId, text }) => sealedEntry(ports, line, commitId, text))))

/**
 * Put sealed entries on the end of a line, only where it ends at `after`:
 * where it then ends. Tried once: a line that moved on meanwhile says so,
 * with where it now ends, for the caller to decide what to put there.
 * `keep`, how long the line is kept, goes only with the entries that make
 * it, put at its start; a line given none is kept as a book's.
 */
export const putAt = async (relay: Relay, line: SealedLine, sealed: readonly SealedCommitDto[], after: number, keep?: LineKeep): Promise<Outcome<number>> => {
  const put = await relay.append(line.access, after, sealed, after === 0 ? keep : undefined)
  return put.ok ? Ok(put.value.head) : Err({ type: "sync", problem: put.error })
}

/** Where a line was said to end, when a put found it had moved on; none for any other failure. */
export const behindAt = (failed: Outcome<unknown>): number | undefined => (!failed.ok && failed.error.type === "sync" && failed.error.problem.type === "behind" ? failed.error.problem.head : undefined)

const opened = async <E>(ports: SealedLinePorts, keys: LineKeys, entry: SealedCommitDto, read: (text: string) => E | undefined): Promise<E | undefined> => {
  const text = await ports.sealer.open(keys, entry.commitId, entry.box)
  const unpacked = text.ok ? ports.packer.unpack(text.value) : undefined
  return unpacked === undefined ? undefined : read(unpacked)
}

const readFrom = async <E>(ports: SealedLinePorts, line: SealedLine, so: SealedLineRead<E>, read: (text: string) => E | undefined): Promise<Outcome<SealedLineRead<E>>> => {
  const given = await ports.relay.entriesAfter(line.access, so.head)
  if (!given.ok) return given.error.type === "line-missing" ? Ok(so) : Err({ type: "sync", problem: given.error })
  if (given.value.entries.length === 0) return Ok(so)
  const entries = (await Promise.all(given.value.entries.map(async (entry) => ({ seq: entry.seq, entry: await opened(ports, line.keys, entry, read) })))).flatMap(({ seq, entry }) => (entry === undefined ? [] : [{ seq, entry }]))
  const next: SealedLineRead<E> = { head: given.value.entries.at(-1)?.seq ?? so.head, entries: [...so.entries, ...entries] }
  return next.head >= given.value.head ? Ok(next) : readFrom(ports, line, next, read)
}

/**
 * What a line carries after a place on it, read to its end a page at a
 * time: a line nobody has put anything on yet is an empty one, and an
 * entry this app cannot open or read is passed over.
 */
export const readLineAfter = <E>(ports: SealedLinePorts, line: SealedLine, after: number, read: (text: string) => E | undefined): Promise<Outcome<SealedLineRead<E>>> => readFrom(ports, line, { head: after, entries: [] }, read)
