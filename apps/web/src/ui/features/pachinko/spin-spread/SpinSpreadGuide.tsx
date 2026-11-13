import { For, type JSX } from "solid-js"

import { spinRangeOf } from "../../../../core/pachinko/spin-spread/spin-spread"
import { coverageText, spinRangeText } from "../../../wording/pachinko/spin-spread"

/** The 4円 corner the table is worked out at: 250 balls to ¥1,000. */
const RENTED_PER_THOUSAND = 250

/** The spin performance the table is worked out at. */
const SPIN_PERFORMANCE = 18

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

/** The range after so many yen played at the table's corner and spin performance, by the same function the play's note is (`spinRangeOf`), so that the two never disagree. */
const rangeAfter = (yen: number) => ((balls) => spinRangeOf((SPIN_PERFORMANCE * balls) / RENTED_PER_THOUSAND, balls, RENTED_PER_THOUSAND))((yen * RENTED_PER_THOUSAND) / 1000)

/**
 * What このアプリの仕様 says of the range by a live play's spin
 * performance: how it is worked out, how sure it is and how it narrows as
 * more is played, with a table at a 4円 corner, and what it leaves out.
 */
export function SpinSpreadGuide(): JSX.Element {
  return (
    <>
      <p>
        パチンコライブ計測の回転率の横の ⓘ は、本当の回転率が入っていそうな範囲と、その確率を出します。打った玉1個ずつが、決まった確率でヘソに入って1回転になるものとして、ここまで通常時に打った玉の数から計算します。範囲は、二項分布のWilson（ウィルソン）区間です。打ち始めの玉が少ないときや、まだ1回転もしていないときでも、範囲がつぶれません。
      </p>
      <p>
        確率と範囲は、打つほど両方そろって収束します。打った玉が増えてわかることを、確率を上げる分と範囲を狭める分に半分ずつ使うためです。打った玉を貸玉の金額に直して、1万円で90%になるまでは、打った分が4倍になるごとに確率が上がり、範囲は約0.71倍に狭まります。1万円から先は90%のまま、範囲だけが狭まります。確率は打った量だけで決まり、出た回転率には左右されません。
      </p>
      <p>4円（1,000円で250玉）で回転率18のときは、次のとおりです。持ち玉や貯玉で打った分も、貸玉に直した金額で数えます。</p>
      <div class="overflow-x-auto">
        <table class="w-full min-w-max text-right tabular-nums">
          <thead>
            <tr class="border-b border-border text-xs text-text-muted">
              <th class="py-1 pr-3 text-left font-normal">打った分</th>
              <th class="py-1 pl-3 font-normal">確率</th>
              <th class="py-1 pl-3 font-normal">範囲</th>
            </tr>
          </thead>
          <tbody>
            <For each={PLAYED_YEN}>
              {([yen, named]) => (
                <tr class="border-b border-border/60">
                  <td class="py-1 pr-3 text-left">{named}</td>
                  <td class="py-1 pl-3">{coverageText(rangeAfter(yen))}</td>
                  <td class="py-1 pl-3">{spinRangeText(rangeAfter(yen))}</td>
                </tr>
              )}
            </For>
          </tbody>
        </table>
      </div>
      <p>1円（1,000円で1,000玉）でも同じ計算で、打った玉を貸玉の金額に直して確率を決めます。</p>
      <p>
        この範囲は理論上のものです。保留が満タンのあいだにヘソに入った玉は回転にならないので、実際の範囲は少しだけ狭くなります。反対に、玉の寄りのムラ、止め打ち、持ち玉の数え間違いがあると、実際の範囲は広くなります。
      </p>
    </>
  )
}
