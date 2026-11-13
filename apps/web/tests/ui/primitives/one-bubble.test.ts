import { describe, expect, test } from "bun:test"
import { createRoot } from "solid-js"

import { createBubble } from "../../../src/ui/primitives/one-bubble"

/** A bubble and one opened from inside it, made as the screen makes them: the inner one drawn inside the outer's `Inside`. */
const nested = (): { readonly outer: ReturnType<typeof createBubble>; readonly inner: ReturnType<typeof createBubble> } =>
  createRoot(() => {
    const outer = createBubble()
    const [, , Inside] = outer
    const held: { inner: ReturnType<typeof createBubble> | undefined } = { inner: undefined }
    Inside({
      get children() {
        held.inner = createBubble()
        return undefined
      },
    })
    if (held.inner === undefined) throw new Error("the inner bubble was not made")
    return { outer, inner: held.inner }
  })

describe("createBubble", () => {
  test("opening one bubble closes another beside it", () => {
    const [[firstOpen, setFirst], [secondOpen, setSecond]] = createRoot(() => [createBubble(), createBubble()])
    setFirst(true)
    setSecond(true)
    expect([firstOpen(), secondOpen()]).toEqual([false, true])
  })

  test("a bubble opened from inside another leaves that one open", () => {
    const { outer, inner } = nested()
    outer[1](true)
    inner[1](true)
    expect([outer[0](), inner[0]()]).toEqual([true, true])
  })

  test("closing the inner bubble leaves the outer open", () => {
    const { outer, inner } = nested()
    outer[1](true)
    inner[1](true)
    inner[1](false)
    expect([outer[0](), inner[0]()]).toEqual([true, false])
  })

  test("closing the outer bubble closes the inner with it", () => {
    const { outer, inner } = nested()
    outer[1](true)
    inner[1](true)
    outer[1](false)
    expect([outer[0](), inner[0]()]).toEqual([false, false])
  })

  test("a bubble closed after another opened leaves that one as it is", () => {
    const [[, setFirst], [secondOpen, setSecond]] = createRoot(() => [createBubble(), createBubble()])
    setFirst(true)
    setSecond(true)
    setFirst(false)
    expect(secondOpen()).toBe(true)
  })
})
