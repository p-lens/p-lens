import type { JSX } from "solid-js"
import { MainContent } from "solid-gathering-shell"

import type { Place } from "../../navigation/place"
import { UNDER_THE_HOOD_TITLE } from "../../wording/under-the-hood"
import * as PachinkoViews from "../pachinko"
import { ViewHeader } from "../shell/ViewHeader"

/** One thing the screens do not show, folded under a heading that says it in a line, opened by whoever wants the rest. */
function Fold(props: { readonly title: string; readonly children: JSX.Element }): JSX.Element {
  return (
    <details class="group border-b border-border py-2">
      <summary class="cursor-pointer list-none py-1 text-sm font-semibold text-text-primary marker:hidden hover:text-accent">
        <span class="mr-1.5 inline-block text-text-muted transition-transform group-open:rotate-90">›</span>
        {props.title}
      </summary>
      <div class="flex flex-col gap-2 pb-2 pl-4 pt-1 text-sm leading-relaxed text-text-secondary">{props.children}</div>
    </details>
  )
}

/**
 * このアプリの仕様: what cannot be seen from the screens alone, each folded under a
 * heading that says it in a line — what the colours of the buttons say,
 * that cash never rises, when a day turns, how a reading's outlay is
 * counted, how a spin performance and a border are, what the marks beside
 * pachinko's live spin performance stand for, which formula opens first,
 * how many jackpots a bonus is, what stays out of 収支, how 推定期待値
 * answers, and when a backup is made. Never how to use the app, which its
 * own site says, nor anything of the catalog, which its users make.
 */
export function UnderTheHoodView(props: { readonly place: Place }): JSX.Element {
  return (
    <MainContent header={<ViewHeader place={props.place} title={UNDER_THE_HOOD_TITLE} />}>
      <div class="max-w-3xl">
        <div class="flex flex-col p-4">
          <Fold title="ボタンの色と機能の深さ">
            <p>
              <span class="font-semibold text-amateur">青</span>のボタンだけで、ひととおり使えるように作っています。もっと深く見たい人は
              <span class="font-semibold text-semipro-ink">緑</span>、さらに深く潜りたい人は<span class="font-semibold text-nerdpro-ink">紫</span>
              へ。パチンコの保留の期待度と同じように、色が変わるほど深くなります。
            </p>
          </Fold>
          <Fold title="勝ち分の記録（現金は増加しない）">
            <p>勝った分は、現金ではなく景品（特殊景品・端玉景品）として帳簿に残ります。玉やメダルを景品に替えるときに出る端数は、換算調整勘定で合わせます。</p>
            <p>記録するのは、現金で玉やメダルを借りてから景品に交換するまでです。景品を受け取ったあとのことは記録しません。</p>
          </Fold>
          <Fold title="日付の区切り（標準は午前5時）">
            <p>稼働の日付は営業日で数えます。0時から5時までの稼働は、前の日の分になります。切り替わる時刻は、設定の「日付の区切り」で変えられます。</p>
          </Fold>
          <Fold title="投資の計上時点">
            <p>パチンコライブ計測で、ある行に書いた投資や貯玉引出は、「前の行からその行までに打ち切った分」として回転率を測ります。</p>
            <p>座ってすぐ、0回転の行に書いた分は、計測の起点になります。</p>
          </Fold>
          <Fold title="回転率とボーダーの算出基準">
            <p>回転率は、払った1,000円で借りられる玉あたりの回転数です。貯玉や持ち玉で打った分も、貸玉に直して数えます。貸玉が割高な島（1,000円で232玉など）では、ボーダーが上がるのではなく、回転率が下がる形で表れます。</p>
            <p>パチンコライブ計測の実質ボーダーは、打った玉の値段で決まります。現金で借りた玉は借りた値段、貯玉や持ち玉は交換の値段で数えるので、それらで打つほど下がり、持ち玉だけなら交換率に関係なく等価のボーダーになります。</p>
            <p>推定期待値のボーダーは、推定した持ち玉比率で同じように計算します。機種情報などに出るほかのボーダーは、すべて現金で打ったときのものです。</p>
          </Fold>
          <Fold title="回転率の記号と時給の目安">
            <p>パチンコライブ計測の回転率の横の記号は、1回転あたりの期待値を、どの機種でも1時間200回転として時給に直したものです。記号ごとの時給はこうなります。</p>
            <PachinkoViews.StandingMarksLegend />
            <p class="text-xs text-text-muted">上の3つ（王冠、金の六芒星、金の星）は、300回転以上測って90分以上打つまでは出ず、赤い星で止まります。期待値（時給）の数字のほうは、機種・算出条件に1時間の回転数があればそれを使います。</p>
          </Fold>
          <Fold title="算出条件の自動選択の順位">
            <p>機種を選ぶと、帳簿のお気に入りの算出条件があればそれが開きます。なければ、点数のいちばん高いものが開きます。</p>
            <p>点数は、作り方（計算エンジンで解いたもの16点、シミュレーションで推定したもの3点、手入力0点）に、検証OK・検証NGが1人あたり±10点、イチオシ・非推奨が1人あたり±2点、使われた回数が1回あたり0.01点（最大で約16点）を足したものです。同じ点数なら、期待値の辛いほう、古いほうが先です。</p>
          </Fold>
          <Fold title="ボーナスと大当り回数の対応">
            <p>「3000発（1500発×2回）」のように、1つのボーナスが大当り何回分かは機種ごとに決まっていて、大当りはデータカウンタと同じく1回ずつ数えます。</p>
            <p>ホールのデータカウンタが、どのボーナスも1回と数える台では、台の画面の「どのボーナスも1回でカウント」をオンにすると、そちらに合わせられます。</p>
          </Fold>
          <Fold title="失効・交換率変動の扱い（収支に含めない）">
            <p>貯玉の失効や、店の交換率が変わって貯玉の値打ちが増えたり減ったりした分は、「その他損益」として別に出します。稼働の収支には入れません。</p>
          </Fold>
          <Fold title="推定期待値の再現性">
            <p>同じ稼働は、何度推定しても同じ結果になります。押し直して引き直すことはできません。</p>
            <p>めったにない展開の稼働は、期待値の代わりに「約○回に1回」の珍しさで出ます。手がかりが少なすぎる稼働は、推定できないと出ます。</p>
          </Fold>
          <Fold title="バックアップの実行条件（手動のみ）">
            <p>バックアップは、ボタンを押したときにだけ作ります。アプリが自分からバックアップ先に送ったり、問い合わせたりすることはありません。共有している帳簿の同期は、これとは別です。</p>
          </Fold>
        </div>
      </div>
    </MainContent>
  )
}
