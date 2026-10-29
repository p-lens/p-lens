import { afterAll, describe, expect, test } from "bun:test"

import { fetchUnlessStalled } from "../../src/download/unless-stalled"

const pause = (millis: number): Promise<void> => new Promise((resume) => setTimeout(resume, millis))

/** A body sent as `pieces` bytes, `apart` milliseconds from one to the next. */
const trickled = (pieces: number, apart: number): Response =>
  new Response(
    new ReadableStream<Uint8Array>({
      start: async (stream) => {
        for (const index of Array.from({ length: pieces }, (_, at) => at)) {
          await pause(apart)
          stream.enqueue(new Uint8Array([index]))
        }
        stream.close()
      },
    }),
  )

const server = Bun.serve({
  port: 0,
  fetch: (request) => {
    const path = new URL(request.url).pathname
    return path === "/slow" ? trickled(8, 40) : path === "/stalls" ? trickled(2, 300) : new Response("missing", { status: 404 })
  },
})

afterAll(() => server.stop(true))

describe("a download watched for stalling", () => {
  test("arrives whole however long it takes, while bytes keep coming", async () => {
    const response = await fetchUnlessStalled(`${server.url.href}slow`, 150)
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(new Uint8Array([0, 1, 2, 3, 4, 5, 6, 7]))
  })

  test("is given up once nothing arrives for the quiet it is allowed", async () => {
    const response = await fetchUnlessStalled(`${server.url.href}stalls`, 150).catch((cause: unknown) => cause)
    const read = response instanceof Response ? await response.arrayBuffer().then(() => "read", (cause: unknown) => cause) : response
    expect(read).toBeInstanceOf(Error)
  })
})
