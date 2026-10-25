import { createSignal, For, Show, type JSX } from "solid-js"

import { DOCUMENT_KINDS } from "../../../core/document/document"
import { useApp } from "../../context"
import { useMoves } from "../../navigation/moves"
import { CloseIcon, QuestionIcon } from "../../primitives/icons"
import { documentTitle, OPERATOR_PAGE } from "../../wording/documents"
import { WELCOME_AGAIN } from "../../wording/onboarding"
import { useWelcome } from "../onboarding/welcome"
import * as PachinkoViews from "../pachinko"

/**
 * A question mark in the top bar's corner that says what P-Lens is — a
 * private book of one's play, kept as text on the device, filled from what
 * is recorded at the cabinet, and shared among friends — and how far the
 * book goes: from cash rented into balls or medals to prizes given for
 * them, inside the parlor, and nothing of what becomes of a prize after;
 * and at its foot,
 * where its licences are and, where the deployment has one, where the
 * product's own site is. Its words
 * are those of the release: sharing is named
 * before it is built, and the app is not released until it is. It drops down from the mark and stays
 * until closed, with nothing darkened behind it. The welcome is opened
 * again from its foot, before the documents the
 * deployment puts before people, its terms and its privacy policy, which
 * are linked from there where there are any; then 仕様説明, which opens
 * in place what cannot be seen from the screens alone — what the colours
 * of its buttons say, what each mark beside a live play's spin performance
 * stands for, and how a spin performance and a border are counted — never
 * how to use the app, which its own site says, nor anything of the
 * catalog, which its users make; and under them who runs the
 * deployment and the version of the app this copy was built from. It
 * scrolls within itself where all that is taller than the screen.
 */
export function AboutButton(): JSX.Element {
  const moves = useMoves()
  const app = useApp()
  const welcome = useWelcome()
  const [open, setOpen] = createSignal(false)
  const [explained, setExplained] = createSignal(false)
  return (
    <div class="relative">
      <button
        type="button"
        onClick={() => setOpen((was) => !was)}
        aria-label={`${app.services.name} について`}
        title={`${app.services.name} について`}
        aria-expanded={open()}
        class="flex size-7 items-center justify-center rounded text-text-muted hover:bg-surface-3 hover:text-text-primary [&_svg]:size-5"
        classList={{ "bg-surface-3 text-text-primary": open() }}
      >
        <QuestionIcon />
      </button>
      <Show when={open()}>
        <div class="absolute right-0 top-full z-30 mt-1 flex max-h-[calc(100dvh-4rem)] w-[min(22rem,calc(100vw-1rem))] flex-col gap-3 overflow-y-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden rounded-md border border-border bg-surface-1 p-4 shadow-lg">
          <div class="flex items-center justify-between gap-2">
            <p class="text-sm font-semibold text-text-primary">このアプリについて</p>
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="閉じる"
              title="閉じる"
              class="-mr-1 flex size-6 items-center justify-center rounded text-text-muted hover:bg-surface-3 hover:text-text-primary [&_svg]:size-4"
            >
              <CloseIcon label="閉じる" />
            </button>
          </div>
          <section class="flex flex-col gap-2 text-sm leading-relaxed text-text-secondary">
            <p>パチンコ・パチスロの収支をつける、プライベートな帳簿アプリです。</p>
            <p>つけるのは、遊技の記録としての収支です。現金で玉・メダルを借りてから景品に交換するまで、パチンコ店の中で起きたことだけを記録します。景品を受け取ったあとのことは扱いません。</p>
            <p>打っている間にデータカウンターと投資額を記録すると、仕訳を自動で作り、期待値も残します。貯玉は店ごとの通貨として、交換率と一緒に記録します。</p>
            <p>帳簿は会計ソフト hledger のテキスト形式で、この端末に保存されます。仲間うちで共有して、連結会計もできます。</p>
          </section>
          <div class="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 border-t border-border pt-3 text-sm">
            <button
              type="button"
              class="text-accent hover:underline"
              onClick={() => {
                setOpen(false)
                welcome.show()
              }}
            >
              {WELCOME_AGAIN}
            </button>
            <For each={DOCUMENT_KINDS.filter((kind) => app.services.documents[kind] !== undefined)}>
              {(kind) => (
                <button
                  type="button"
                  class="text-accent hover:underline"
                  onClick={() => {
                    setOpen(false)
                    moves.go({ kind: "document", document: kind })
                  }}
                >
                  {documentTitle(kind)}
                </button>
              )}
            </For>
            <button
              type="button"
              class="text-accent hover:underline"
              onClick={() => {
                setOpen(false)
                moves.go({ kind: "settings-section", section: "licenses" })
              }}
            >
              ライセンス
            </button>
            <Show when={app.services.landingPage} keyed>
              {(page) => (
                <a href={page} target="_blank" rel="noreferrer" class="text-accent hover:underline">
                  公式サイト
                </a>
              )}
            </Show>
          </div>
          <div class="flex flex-col gap-3 text-sm">
            <button type="button" class="self-start text-accent hover:underline" aria-expanded={explained()} onClick={() => setExplained((was) => !was)}>
              仕様説明
            </button>
            <Show when={explained()}>
              <section class="flex flex-col gap-2 text-sm leading-relaxed text-text-secondary">
                <p class="font-semibold text-text-primary">ボタンの色</p>
                <p>
                  <span class="font-semibold text-amateur">青</span>のボタンだけで、ひととおり使えるように作っています。もっと深く見たい人は
                  <span class="font-semibold text-semipro-ink">緑</span>、さらに深く潜りたい人は<span class="font-semibold text-nerdpro-ink">紫</span>
                  へ。パチンコの保留の期待度と同じように、色が変わるほど深くなります。
                </p>
              </section>
              <section class="flex flex-col gap-2 text-sm leading-relaxed text-text-secondary">
                <p class="font-semibold text-text-primary">パチンコライブ計測の回転率の記号</p>
                <p>回転率の横の記号は、1回転あたりの期待値を、どの機種でも1時間200回転として時給に直したものです。記号ごとの時給はこうなります。</p>
                <PachinkoViews.StandingMarksLegend />
                <p class="text-xs text-text-muted">上の3つ（王冠と金の星）は、300回転以上測って90分以上打つまでは出ず、赤い星で止まります。期待値（時給）の数字のほうは、機種・算出条件に1時間の回転数があればそれを使います。</p>
              </section>
              <section class="flex flex-col gap-2 text-sm leading-relaxed text-text-secondary">
                <p class="font-semibold text-text-primary">回転率とボーダー</p>
                <p>回転率は、払った1,000円で借りられる玉あたりの回転数です。貯玉や持ち玉で打った分も、貸玉に直して数えます。貸玉が割高な島（1,000円で232玉など）では、ボーダーが上がるのではなく、回転率が下がる形で表れます。</p>
                <p>パチンコライブ計測の実質ボーダーは、打った玉の値段で決まります。現金で借りた玉は借りた値段、貯玉や持ち玉は交換の値段で数えるので、それらで打つほど下がり、持ち玉だけなら交換率に関係なく等価のボーダーになります。</p>
                <p>推定期待値のボーダーは、推定した持ち玉比率で同じように計算します。機種情報などに出るほかのボーダーは、すべて現金で打ったときのものです。</p>
              </section>
            </Show>
          </div>
          <div class="flex flex-col gap-0.5 text-xs text-text-muted">
            <p>
              <a href={app.services.operatorPage} target="_blank" rel="noreferrer" class="text-accent hover:underline">
                {OPERATOR_PAGE}
              </a>
            </p>
            <p class="tabular-nums">バージョン {app.services.version}</p>
          </div>
        </div>
      </Show>
    </div>
  )
}
