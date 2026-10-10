import { createSignal, For, Show, type JSX } from "solid-js"

import { DOCUMENT_KINDS } from "../../../core/document/document"
import { useApp } from "../../context"
import { useMoves } from "../../navigation/moves"
import { CloseIcon, QuestionIcon } from "../../primitives/icons"
import { documentTitle } from "../../wording/documents"

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
 * until closed, with nothing darkened behind it. The documents the
 * deployment puts before people, its terms and its privacy policy, are
 * linked from its foot where there are any, and under them who runs the
 * deployment and the version of the app this copy was built from.
 */
export function AboutButton(): JSX.Element {
  const moves = useMoves()
  const app = useApp()
  const [open, setOpen] = createSignal(false)
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
        <div class="absolute right-0 top-full z-30 mt-1 flex w-[min(22rem,calc(100vw-1rem))] flex-col gap-3 rounded-md border border-border bg-surface-1 p-4 shadow-lg">
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
            <p>パチンコ・パチスロの収支をつける、プライベートな帳簿アプリです。勝ち方を教えるのではなく、自分の稼働を正確に残すためのものです。</p>
            <p>つけるのは、遊技の記録としての収支です。現金で玉・メダルを借りてから景品に交換するまで、パチンコ店の中で起きたことだけを記録します。景品を受け取ったあとのことは扱いません。</p>
            <p>打っている間にデータカウンターと投資額を記録すると、仕訳を自動で作り、期待値も残します。貯玉は店ごとの通貨として、交換率と一緒に記録します。</p>
            <p>帳簿は会計ソフト hledger のテキスト形式で、この端末に保存されます。仲間うちで共有して、連結会計もできます。</p>
          </section>
          <div class="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 border-t border-border pt-3 text-sm">
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
                  公式サイト（{new URL(page).host}）
                </a>
              )}
            </Show>
          </div>
          <div class="flex flex-col gap-0.5 text-xs text-text-muted">
            <p>
              運営：{app.services.operator.name}（
              <a href={app.services.operator.page} target="_blank" rel="noreferrer" class="text-accent hover:underline">
                {new URL(app.services.operator.page).host + new URL(app.services.operator.page).pathname}
              </a>
              ）
            </p>
            <p class="tabular-nums">バージョン {app.services.version}</p>
          </div>
        </div>
      </Show>
    </div>
  )
}
