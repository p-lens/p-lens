import { For, type JSX } from "solid-js"

import { SPREAD_COVERAGE_PERCENT, SPREAD_DEVIATIONS, spreadAfterYen } from "../../../../core/pachinko/spin-spread/spin-spread"
import { spreadText } from "../../../wording/pachinko/spin-spread"

/** The 4円 corner the table is worked out at: 250 balls to ¥1,000. */
const RENTED_PER_THOUSAND = 250

/** The spin performances the table has a column for. */
const SPIN_PERFORMANCES = [16, 18, 20] as const

/** The yen played the table has a row for, each with how its row names it. */
const PLAYED_YEN = [
  [500, "500円"],
  [1000, "1,000円"],
  [2000, "2,000円"],
  [5000, "5,000円"],
  [10_000, "1万円"],
  [20_000, "2万円"],
  [30_000, "3万円"],
] as const

/**
 * What このアプリの仕様 says of the range by a live play's spin
 * performance: how it is worked out, what it leaves out, and how it
 * narrows at a 4円 corner, worked out by the same function the play's
 * note is (`spreadAfterYen`), so that the two never disagree.
 */
export function SpinSpreadGuide(): JSX.Element {
  return (
    <>
      <p>
        パチンコライブ計測の回転率の i は、本当の回転率が{String(SPREAD_COVERAGE_PERCENT)}%の確率で入る範囲を出します。打った玉1個ずつが、決まった確率でヘソに入って1回転になるものとして、ここまで通常時に打った玉の数から計算します。
      </p>
      <p>
        幅は、回転率をR、1,000円で借りられる玉をk、打った玉をnとして、±{SPREAD_DEVIATIONS.toFixed(2)} × √(R ×（k − R）÷ n)です。√の部分が回転率の標準偏差で、その{SPREAD_DEVIATIONS.toFixed(2)}倍まで取ると、{String(SPREAD_COVERAGE_PERCENT)}%（10回に9回）はこの範囲に入ります。打った玉が4倍になると、幅は半分になります。
      </p>
      <p>4円（1,000円で250玉）のときの幅は、次のとおりです。持ち玉や貯玉で打った分も、貸玉に直した金額で数えます。</p>
      <div class="overflow-x-auto">
        <table class="w-full min-w-max text-right tabular-nums">
          <thead>
            <tr class="border-b border-border text-xs text-text-muted">
              <th class="py-1 pr-3 text-left font-normal">打った分</th>
              <For each={SPIN_PERFORMANCES}>{(spinPerformance) => <th class="py-1 pl-3 font-normal">回転率{String(spinPerformance)}</th>}</For>
            </tr>
          </thead>
          <tbody>
            <For each={PLAYED_YEN}>
              {([yen, named]) => (
                <tr class="border-b border-border/60">
                  <td class="py-1 pr-3 text-left">{named}</td>
                  <For each={SPIN_PERFORMANCES}>{(spinPerformance) => <td class="py-1 pl-3">{spreadText(spreadAfterYen(spinPerformance, RENTED_PER_THOUSAND, yen))}</td>}</For>
                </tr>
              )}
            </For>
          </tbody>
        </table>
      </div>
      <p>1円（1,000円で1,000玉）でも同じ式で、kを1,000にして計算します。</p>
      <p>
        この幅は理論上のものです。保留が満タンのあいだにヘソに入った玉は回転にならないので、実際の幅は少しだけ狭くなります。反対に、玉の寄りのムラ、止め打ち、持ち玉の数え間違いがあると、実際の幅は広くなります。
      </p>
    </>
  )
}
