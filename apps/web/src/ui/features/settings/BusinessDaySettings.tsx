import { createSignal, type JSX } from "solid-js"
import { MainContent } from "solid-gathering-shell"

import { BUSINESS_DAY_TURNS, readBusinessDayTurn } from "../../../core/calendar/calendar"
import { useApp } from "../../context"
import { Select } from "../../primitives/select"
import type { Place } from "../../navigation/place"
import { businessDayTurnText, formatDay } from "../../wording/dates"
import { ViewHeader } from "../shell/ViewHeader"

/**
 * The hour a business day turns over at: the day a play is dated, and what
 * 今日 means wherever plays are counted. Changed here, it holds from the
 * next play on; plays already recorded keep the day they were given.
 */
export function BusinessDaySettings(props: { readonly place: Place }): JSX.Element {
  const app = useApp()
  const [turn, setTurn] = createSignal(app.services.preferences.businessDayTurn())
  const choose = (value: string): void => {
    const chosen = readBusinessDayTurn(value)
    app.services.preferences.setBusinessDayTurn(chosen)
    setTurn(chosen)
  }
  const today = (): string => {
    turn()
    return formatDay(app.services.businessDay())
  }
  return (
    <MainContent header={<ViewHeader place={props.place} title="日付の区切り" />}>
      <div class="max-w-5xl">
        <div class="flex flex-col gap-6 p-4">
          <section class="max-w-sm">
            <Select
              label="1日の切り替え時刻"
              options={BUSINESS_DAY_TURNS.map((hour) => ({ value: String(hour), label: businessDayTurnText(hour) }))}
              value={String(turn())}
              onChange={choose}
              placeholder="時刻を選ぶ"
            />
          </section>
          <p class="text-sm text-text-muted">
            この時刻までは前の日として数えます。深夜まで続いた稼働が、打ち始めた日の稼働として記録されます。概要の「今日」「今月」も同じ区切りです。いまは {today()} として記録されます。
          </p>
          <p class="text-sm text-text-muted">この設定はこの端末だけのものです。すでに記録した稼働の日付は変わりません。</p>
        </div>
      </div>
    </MainContent>
  )
}
