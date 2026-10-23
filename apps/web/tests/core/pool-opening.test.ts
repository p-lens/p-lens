import { describe, expect, test } from "bun:test"

import type { IsoDate } from "../../src/core/calendar/calendar"
import { checkOpening, openingText, parlorOpened, type PoolOpening } from "../../src/core/parlor/opening"
import type { ParlorId, SubmissionId } from "../../src/core/parlor/parlor"
import { PRICES, MALEHAN, dec } from "../support/values"

const MEGA_CONDOR: PoolOpening = { identity: { type: "listed", id: "mega-condor" as ParlorId }, parlorName: "メガコンドル見滝原店", pool: { kind: "ball", tier: "1円" }, rate: dec("0.892857"), date: "2026-10-04" as IsoDate }

describe("opening a pool in a book", () => {
  test("declares a pool the book does not keep, and writes the day's rate", () => {
    expect(openingText(MEGA_CONDOR, [MALEHAN], PRICES)).toEqual({
      declarations: 'commodity 1. "玉(1円・メガコンドル見滝原店)"\naccount 資産:貯玉:メガコンドル見滝原店:1円  ; parlor-id: mega-condor\n',
      price: 'P 2026-10-04 "玉(1円・メガコンドル見滝原店)" 0.892857 JPY\n',
    })
    expect(parlorOpened(MEGA_CONDOR, [MALEHAN])).toEqual({ identity: { type: "listed", id: "mega-condor" }, name: "メガコンドル見滝原店", pools: [{ kind: "ball", tier: "1円" }] } as never)
  })

  test("writes only the rate for a pool the book keeps, and nothing when the book already has that rate for the day", () => {
    const malehan: PoolOpening = { identity: MALEHAN.identity, parlorName: MALEHAN.name, pool: { kind: "ball", tier: "4円" }, rate: dec("3.571429"), date: "2026-09-25" as IsoDate }
    expect(openingText(malehan, [MALEHAN], PRICES)).toEqual({ declarations: undefined, price: 'P 2026-09-25 "玉(4円・マレハン東京皇国第8支店)" 3.571429 JPY\n' })
    expect(openingText({ ...malehan, rate: dec("3.50") }, [MALEHAN], PRICES)).toEqual({ declarations: undefined, price: undefined })
  })

  test("writes no rate for a later day whose rate in force is already that, set on an earlier day", () => {
    const malehan: PoolOpening = { identity: MALEHAN.identity, parlorName: MALEHAN.name, pool: { kind: "ball", tier: "4円" }, rate: dec("3.57"), date: "2026-09-10" as IsoDate }
    expect(openingText(malehan, [MALEHAN], PRICES)).toEqual({ declarations: undefined, price: undefined })
    expect(openingText({ ...malehan, date: "2026-10-12" as IsoDate }, [MALEHAN], PRICES).price).toBe('P 2026-10-12 "玉(4円・マレハン東京皇国第8支店)" 3.57 JPY\n')
  })

  test("declares a submitted parlor's pool by its submission while it waits on the list", () => {
    const waiting: PoolOpening = { ...MEGA_CONDOR, identity: { type: "submitted", submission: "sub_01" as SubmissionId } }
    expect(openingText(waiting, [], PRICES).declarations).toBe('commodity 1. "玉(1円・メガコンドル見滝原店)"\naccount 資産:貯玉:メガコンドル見滝原店:1円  ; parlor-submission: sub_01\n')
  })

  test("refuses a name it cannot write, a name another parlor of the book has, and a rate not above zero", () => {
    expect(checkOpening({ ...MEGA_CONDOR, parlorName: "東京皇国:第8支店" }, [])).toEqual({ ok: false, error: { type: "name-unwritable", name: "東京皇国:第8支店" } })
    expect(checkOpening({ ...MEGA_CONDOR, parlorName: MALEHAN.name }, [MALEHAN])).toEqual({ ok: false, error: { type: "name-taken", name: MALEHAN.name } })
    expect(checkOpening({ ...MEGA_CONDOR, parlorName: "マレハン 東京皇国第8支店" }, [MALEHAN])).toEqual({ ok: false, error: { type: "name-taken", name: "マレハン 東京皇国第8支店" } })
    expect(checkOpening({ ...MEGA_CONDOR, identity: MALEHAN.identity, parlorName: "マレハン 東京皇国第8支店" }, [MALEHAN]).ok).toBe(true)
    expect(checkOpening({ ...MEGA_CONDOR, rate: dec("0") }, [])).toEqual({ ok: false, error: { type: "rate-not-positive" } })
    expect(checkOpening(MEGA_CONDOR, [MALEHAN])).toEqual({ ok: true, value: MEGA_CONDOR })
  })
})
