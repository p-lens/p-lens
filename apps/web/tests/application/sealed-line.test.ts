import { describe, expect, test } from "bun:test"

import { behindAt, putAt, readLineAfter, sealedEntries, type SealedLine, type SealedLinePorts } from "../../src/application/sealed-line"
import { accessOf } from "../../src/sync/port/sealer"
import { createDeflatePacker } from "../../src/sync/deflate/deflate-packer"
import { createWebCryptoSealer } from "../../src/sync/web-crypto/web-crypto-sealer"
import { memoryRelay } from "../support/sync"

const portsOn = (): SealedLinePorts => ({ relay: memoryRelay(), sealer: createWebCryptoSealer(), packer: createDeflatePacker() })

const lineFor = async (ports: SealedLinePorts, secret = ports.sealer.newSecret()): Promise<SealedLine> => {
  const keys = await ports.sealer.huddleKeysOf(secret)
  if (!keys.ok) throw new Error("expected keys")
  return { access: accessOf("https://relay.example", keys.value), keys: keys.value }
}

const texts = (count: number, from = 1) => Array.from({ length: count }, (_, index) => ({ commitId: `commit-${from + index}-xxxxxxxxxxxx`, text: `entry ${from + index}` }))

const sealedOf = async (ports: SealedLinePorts, line: SealedLine, count: number, from = 1) => {
  const sealed = await sealedEntries(ports, line, texts(count, from))
  if (!sealed.ok) throw new Error("expected sealing")
  return sealed.value
}

const kept = (text: string): string | undefined => (text.startsWith("entry") ? text : undefined)

describe("a sealed line", () => {
  test("takes entries where it ends and gives them back, a page at a time, each at its place", async () => {
    const ports = portsOn()
    const line = await lineFor(ports)
    expect(await putAt(ports.relay, line, await sealedOf(ports, line, 3), 0)).toEqual({ ok: true, value: 3 })
    expect(await putAt(ports.relay, line, await sealedOf(ports, line, 2, 4), 3)).toEqual({ ok: true, value: 5 })
    const read = await readLineAfter(ports, line, 1, kept)
    expect(read).toEqual({ ok: true, value: { head: 5, entries: [2, 3, 4, 5].map((seq) => ({ seq, entry: `entry ${seq}` })) } })
  })

  test("says where it ends, once, when it moved on under a put", async () => {
    const ports = portsOn()
    const line = await lineFor(ports)
    await putAt(ports.relay, line, await sealedOf(ports, line, 2), 0)
    const late = await putAt(ports.relay, line, await sealedOf(ports, line, 1, 3), 1)
    expect(behindAt(late)).toBe(2)
    expect(behindAt(await putAt(ports.relay, line, await sealedOf(ports, line, 1, 3), 2))).toBeUndefined()
  })

  test("nobody has put anything on is empty, and an entry this app does not read is passed over", async () => {
    const ports = portsOn()
    const line = await lineFor(ports)
    expect(await readLineAfter(ports, line, 0, kept)).toEqual({ ok: true, value: { head: 0, entries: [] } })
    await putAt(ports.relay, line, await sealedEntries(ports, line, [{ commitId: "commit-x-xxxxxxxxxxxx", text: "not one" }]).then((sealed) => (sealed.ok ? sealed.value : [])), 0)
    await putAt(ports.relay, line, await sealedOf(ports, line, 1, 2), 1)
    expect(await readLineAfter(ports, line, 0, kept)).toEqual({ ok: true, value: { head: 2, entries: [{ seq: 2, entry: "entry 2" }] } })
  })

  test("opens only with its own keys: another line's entries put on it are passed over", async () => {
    const ports = portsOn()
    const line = await lineFor(ports)
    const stranger = await lineFor(ports)
    await putAt(ports.relay, line, await sealedOf(ports, stranger, 1), 0)
    expect(await readLineAfter(ports, line, 0, kept)).toEqual({ ok: true, value: { head: 1, entries: [] } })
  })
})
