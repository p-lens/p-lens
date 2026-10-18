import { describe, expect, test } from "bun:test"

import type { IsoDate } from "../../src/core/calendar/calendar"
import { checkOpening, openingText, parlorOpened, type PoolOpening } from "../../src/core/parlor/opening"
import type { ParlorId, SubmissionId } from "../../src/core/parlor/parlor"
import { PRICES, UMEDA, dec } from "../support/values"

const LUMINA: PoolOpening = { identity: { type: "listed", id: "lumina" as ParlorId }, parlorName: "ルミナ難波店", pool: { kind: "ball", tier: "1円" }, rate: dec("0.892857"), date: "2026-10-04" as IsoDate }

describe("opening a pool in a book", () => {
  test("declares a pool the book does not keep, and writes the day's rate", () => {
    expect(openingText(LUMINA, [UMEDA], PRICES)).toEqual({
      declarations: 'commodity 1. "玉(1円・ルミナ難波店)"\naccount 資産:貯玉:ルミナ難波店:1円  ; parlor-id: lumina\n',
      price: 'P 2026-10-04 "玉(1円・ルミナ難波店)" 0.892857 JPY\n',
    })
    expect(parlorOpened(LUMINA, [UMEDA])).toEqual({ identity: { type: "listed", id: "lumina" }, name: "ルミナ難波店", pools: [{ kind: "ball", tier: "1円" }] } as never)
  })

  test("writes only the rate for a pool the book keeps, and nothing when the book already has that rate for the day", () => {
    const umeda: PoolOpening = { identity: UMEDA.identity, parlorName: UMEDA.name, pool: { kind: "ball", tier: "4円" }, rate: dec("3.571429"), date: "2026-09-25" as IsoDate }
    expect(openingText(umeda, [UMEDA], PRICES)).toEqual({ declarations: undefined, price: 'P 2026-09-25 "玉(4円・マレハン第3新東京店)" 3.571429 JPY\n' })
    expect(openingText({ ...umeda, rate: dec("3.50") }, [UMEDA], PRICES)).toEqual({ declarations: undefined, price: undefined })
  })

  test("writes no rate for a later day whose rate in force is already that, set on an earlier day", () => {
    const umeda: PoolOpening = { identity: UMEDA.identity, parlorName: UMEDA.name, pool: { kind: "ball", tier: "4円" }, rate: dec("3.57"), date: "2026-09-10" as IsoDate }
    expect(openingText(umeda, [UMEDA], PRICES)).toEqual({ declarations: undefined, price: undefined })
    expect(openingText({ ...umeda, date: "2026-10-12" as IsoDate }, [UMEDA], PRICES).price).toBe('P 2026-10-12 "玉(4円・マレハン第3新東京店)" 3.57 JPY\n')
  })

  test("declares a submitted parlor's pool by its submission while it waits on the list", () => {
    const waiting: PoolOpening = { ...LUMINA, identity: { type: "submitted", submission: "sub_01" as SubmissionId } }
    expect(openingText(waiting, [], PRICES).declarations).toBe('commodity 1. "玉(1円・ルミナ難波店)"\naccount 資産:貯玉:ルミナ難波店:1円  ; parlor-submission: sub_01\n')
  })

  test("refuses a name it cannot write, a name another parlor of the book has, and a rate not above zero", () => {
    expect(checkOpening({ ...LUMINA, parlorName: "梅田:本店" }, [])).toEqual({ ok: false, error: { type: "name-unwritable", name: "梅田:本店" } })
    expect(checkOpening({ ...LUMINA, parlorName: UMEDA.name }, [UMEDA])).toEqual({ ok: false, error: { type: "name-taken", name: UMEDA.name } })
    expect(checkOpening({ ...LUMINA, parlorName: "マレハン 第3新東京店" }, [UMEDA])).toEqual({ ok: false, error: { type: "name-taken", name: "マレハン 第3新東京店" } })
    expect(checkOpening({ ...LUMINA, identity: UMEDA.identity, parlorName: "マレハン 第3新東京店" }, [UMEDA]).ok).toBe(true)
    expect(checkOpening({ ...LUMINA, rate: dec("0") }, [])).toEqual({ ok: false, error: { type: "rate-not-positive" } })
    expect(checkOpening(LUMINA, [UMEDA])).toEqual({ ok: true, value: LUMINA })
  })
})
