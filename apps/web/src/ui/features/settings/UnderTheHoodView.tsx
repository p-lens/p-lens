import type { JSX } from "solid-js"
import { MainContent } from "solid-gathering-shell"

import type { Place } from "../../navigation/place"
import { UNDER_THE_HOOD_TITLE } from "../../wording/under-the-hood"
import * as PachinkoViews from "../pachinko"
import { ViewHeader } from "../shell/ViewHeader"

/**
 * 仕様説明: what cannot be seen from the screens alone — what the colours
 * of the buttons say, what each mark beside pachinko's live spin
 * performance stands for, and how a spin performance and a border are
 * counted. Never how to use the app, which its own site says, nor
 * anything of the catalog, which its users make.
 */
export function UnderTheHoodView(props: { readonly place: Place }): JSX.Element {
  return (
    <MainContent header={<ViewHeader place={props.place} title={UNDER_THE_HOOD_TITLE} />}>
      <div class="max-w-3xl">
        <div class="flex flex-col gap-6 p-4">
          <section class="flex flex-col gap-2 text-sm leading-relaxed text-text-secondary">
            <h2 class="text-base font-bold text-text-primary">ボタンの色</h2>
            <p>
              <span class="font-semibold text-amateur">青</span>のボタンだけで、ひととおり使えるように作っています。もっと深く見たい人は
              <span class="font-semibold text-semipro-ink">緑</span>、さらに深く潜りたい人は<span class="font-semibold text-nerdpro-ink">紫</span>
              へ。パチンコの保留の期待度と同じように、色が変わるほど深くなります。
            </p>
          </section>
          <section class="flex flex-col gap-2 text-sm leading-relaxed text-text-secondary">
            <h2 class="text-base font-bold text-text-primary">パチンコライブ計測の回転率の記号</h2>
            <p>回転率の横の記号は、1回転あたりの期待値を、どの機種でも1時間200回転として時給に直したものです。記号ごとの時給はこうなります。</p>
            <PachinkoViews.StandingMarksLegend />
            <p class="text-xs text-text-muted">上の3つ（王冠と金の星）は、300回転以上測って90分以上打つまでは出ず、赤い星で止まります。期待値（時給）の数字のほうは、機種・算出条件に1時間の回転数があればそれを使います。</p>
          </section>
          <section class="flex flex-col gap-2 text-sm leading-relaxed text-text-secondary">
            <h2 class="text-base font-bold text-text-primary">回転率とボーダー</h2>
            <p>回転率は、払った1,000円で借りられる玉あたりの回転数です。貯玉や持ち玉で打った分も、貸玉に直して数えます。貸玉が割高な島（1,000円で232玉など）では、ボーダーが上がるのではなく、回転率が下がる形で表れます。</p>
            <p>パチンコライブ計測の実質ボーダーは、打った玉の値段で決まります。現金で借りた玉は借りた値段、貯玉や持ち玉は交換の値段で数えるので、それらで打つほど下がり、持ち玉だけなら交換率に関係なく等価のボーダーになります。</p>
            <p>推定期待値のボーダーは、推定した持ち玉比率で同じように計算します。機種情報などに出るほかのボーダーは、すべて現金で打ったときのものです。</p>
          </section>
        </div>
      </div>
    </MainContent>
  )
}
