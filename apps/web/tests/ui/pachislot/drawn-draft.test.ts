import { describe, expect, test } from "bun:test"

import type { PachislotDraft } from "../../../src/core/live-play/draft"
import type { PlayId } from "../../../src/core/play/play"
import type { IsoDate } from "../../../src/core/calendar/calendar"
import { drawnDraft } from "../../../src/ui/features/pachislot/live/drawn-draft"
import type { PlayHold } from "../../../src/ui/features/live/play-hold"

const GIVEN: PachislotDraft = {
  id: "p-1" as PlayId,
  date: "2026-10-28" as IsoDate,
  venue: { type: "none", terms: undefined },
  gameKind: "pachislot",
  machine: "made-up",
  cabinetNumber: undefined,
  startedAt: "2026-10-28T01:00:00.000Z",
  log: '{"games":0,"outlay":0}\n',
}

const TAPPED: PachislotDraft = { ...GIVEN, log: `${GIVEN.log}{"games":10,"outlay":1000}\n{"games":20,"outlay":1000}\n{"games":30,"outlay":2000}\n` }

const HELD: PlayHold = { type: "held" }

const FOLLOWED: PlayHold = { type: "followed", shownAt: "2026-10-28T02:00:00.000Z", onContinue: async () => undefined }

describe("the draft a pachislot screen draws", () => {
  test("is the one it last wrote while its play is held here and the log given has not caught up", () => {
    expect(drawnDraft({ draft: TAPPED, over: GIVEN.log }, GIVEN, HELD)).toBe(TAPPED)
  })

  test("is the one given once the play is held by another device, though the one written here is longer: those readings never reached it", () => {
    expect(drawnDraft({ draft: TAPPED, over: GIVEN.log }, GIVEN, FOLLOWED)).toBe(GIVEN)
  })

  test("is the one given where nothing was written here, or for another play", () => {
    expect(drawnDraft(undefined, GIVEN, HELD)).toBe(GIVEN)
    expect(drawnDraft({ draft: { ...TAPPED, id: "p-2" as PlayId }, over: GIVEN.log }, GIVEN, HELD)).toBe(GIVEN)
  })
})
