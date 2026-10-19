import { describe, expect, test } from "bun:test"

import { takeSubmission } from "../../src/application/submissions"
import type { SubmissionId } from "../../src/core/parlor/parlor"
import type { SharedParlor, SharedParlorId } from "../../src/core/parlor/shared"
import { Err, Ok } from "../../src/core/result/result"
import type { ParlorDirectory } from "../../src/parlors/port/parlor-directory"
import type { Submission, SubmissionStore } from "../../src/parlors/port/submission-store"

const MEGA_CONDOR: SharedParlor = {
  id: "osm-1" as SharedParlorId,
  name: "メガコンドル見滝原店",
  reading: "めがこんどるみたきはらてん",
  keywords: [],
  prefecture: "大阪府",
  address: "見滝原市1-2-3",
  location: { latitude: 34.665, longitude: 135.501 },
  submissions: [],
}

const submitted = (name: string): Submission => ({ submission: "sub_01" as SubmissionId, name, prefecture: "大阪府", submittedAt: "2026-10-06T00:00:00.000Z" })

const memoryStore = (): SubmissionStore & { readonly kept: () => readonly Submission[] } => {
  const held: { submissions: readonly Submission[] } = { submissions: [] }
  return {
    list: async () => Ok(held.submissions),
    keep: async (submission) => {
      held.submissions = [submission, ...held.submissions]
      return Ok(undefined)
    },
    kept: () => held.submissions,
  }
}

const listing = (parlors: readonly SharedParlor[]): ParlorDirectory => ({ list: async () => Ok({ parlors, rejections: [] }) })

const unreadable: ParlorDirectory = { list: async () => Err({ type: "unavailable", detail: "offline" }) }

describe("a submission that came back", () => {
  test("is kept on the device when the list has no parlor of its name", async () => {
    const store = memoryStore()
    expect(await takeSubmission(store, listing([MEGA_CONDOR]), submitted("メガコンドル風見野店"))).toEqual({ ok: true, value: { type: "kept" } })
    expect(store.kept()).toEqual([submitted("メガコンドル風見野店")])
  })

  test("is not kept under a name the list already has, however it is spaced", async () => {
    const store = memoryStore()
    expect(await takeSubmission(store, listing([MEGA_CONDOR]), submitted("メガコンドル 見滝原店"))).toEqual({ ok: true, value: { type: "name-listed", parlor: MEGA_CONDOR } })
    expect(store.kept()).toEqual([])
  })

  test("is kept when the list cannot be read", async () => {
    const store = memoryStore()
    expect(await takeSubmission(store, unreadable, submitted("メガコンドル見滝原店"))).toEqual({ ok: true, value: { type: "kept" } })
    expect(store.kept()).toEqual([submitted("メガコンドル見滝原店")])
  })
})
