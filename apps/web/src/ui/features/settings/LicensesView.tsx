import { createResource, For, Show, type JSX } from "solid-js"
import { MainContent } from "solid-gathering-shell"

import { useApp } from "../../context"
import type { Place } from "../../navigation/place"
import { ViewHeader } from "../shell/ViewHeader"
import { loadCredits, type Credit, type GroupId } from "./credits"

/**
 * Where P-Lens's Corresponding Source is offered, as GPL-3.0 asks of anyone
 * who conveys its object code: this app's source, and hledger's, at the
 * versions built in.
 */
const SOURCE_CODE = "https://github.com/p-lens/p-lens"

const HEADINGS: Readonly<Record<GroupId, string>> = {
  hledger: "会計エンジン（hledger と、組み込まれた Haskell のライブラリ）",
  pachinko: "パチンコの計算エンジン（組み込まれた Rust のクレート）",
  pachislot: "パチスロの計算エンジン（組み込まれた Rust のクレート）",
  web: "アプリ（組み込まれたパッケージ）",
}

/**
 * One credited package, with what has to be reproduced already in view: its
 * name, licence and copyright. Only the licence in full is folded away; a
 * hundred and eighty of them unfolded is a page nobody can read.
 */
function Entry(props: { readonly credit: Credit }): JSX.Element {
  return (
    <li class="flex flex-col gap-1 py-2 text-xs">
      <div class="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
        <span class="font-semibold text-text-primary">{props.credit.name}</span>
        <Show when={props.credit.version}>{(version) => <span class="font-mono text-[11px] text-text-muted">{version()}</span>}</Show>
        <span class="text-text-muted">{props.credit.license ?? "ライセンスの記載なし"}</span>
      </div>
      <Show when={props.credit.copyright}>{(line) => <p class="text-text-muted">{line()}</p>}</Show>
      <Show when={props.credit.note}>{(note) => <p class="text-text-muted">{note()}</p>}</Show>
      <Show when={props.credit.homepage}>
        {(link) => (
          <a href={link()} target="_blank" rel="noreferrer" class="self-start break-all text-text-muted underline underline-offset-2 hover:text-text-primary">
            {link()}
          </a>
        )}
      </Show>
      <Show when={props.credit.text}>
        {(text) => (
          <details class="self-start">
            <summary class="cursor-pointer text-text-muted hover:text-text-primary">ライセンス全文</summary>
            <pre class="mt-1 max-h-64 overflow-auto whitespace-pre-wrap rounded bg-surface-0 p-2 text-[11px] leading-snug text-text-muted">{text()}</pre>
          </details>
        )}
      </Show>
    </li>
  )
}

/**
 * Whose work P-Lens is made of. hledger is named on its own before the lists,
 * because it is not one dependency among many: it does the accounting, and
 * its licence is why this app carries the same one.
 */
export function LicensesView(props: { readonly place: Place }): JSX.Element {
  const app = useApp()
  const [credits] = createResource(loadCredits)
  return (
    <MainContent header={<ViewHeader place={props.place} title="ライセンス" />}>
      <div class="max-w-3xl">
        <div class="flex flex-col gap-6 p-4">
          <section class="flex flex-col gap-2 border-l-2 border-border pl-3 text-sm text-text-secondary">
            <p>{app.services.name} は GNU General Public License バージョン3（またはそれ以降の任意のバージョン）のもとで配布される自由ソフトウェアです。</p>
            <p>{app.services.name} は無保証です。詳しくは GPL の全文をご覧ください。</p>
            <p>名称、ロゴとアイコン、利用規約とプライバシーポリシーの文章は、この配信の運営者のもので、GPL の対象ではありません。</p>
            <p>
              会計は hledger（Simon Michael と貢献者、GPL-3.0-or-later）が行っています。hledger を WebAssembly にしてこのアプリに組み込んでいるため、{app.services.name} も同じライセンスで配布しています。
            </p>
            <p>
              ソースコード（このアプリと、組み込んでいる hledger のもの）は{" "}
              <a href={SOURCE_CODE} target="_blank" rel="noreferrer" class="break-all text-accent underline underline-offset-2">
                {SOURCE_CODE}
              </a>{" "}
              で配布しています。
            </p>
          </section>
          <Show when={credits()} fallback={<p class="text-xs text-text-muted">読み込み中…</p>}>
            {(loaded) => (
              <>
                <For each={loaded().groups}>
                  {(group) => (
                    <section class="flex flex-col gap-1">
                      <h2 class="text-xs font-bold text-text-muted">
                        {HEADINGS[group.id]}（{group.packages.length}）
                      </h2>
                      <ul class="flex flex-col divide-y divide-border border-y border-border">
                        <For each={group.packages}>{(credit) => <Entry credit={credit} />}</For>
                      </ul>
                    </section>
                  )}
                </For>
                <p class="text-xs text-text-muted">
                  {loaded().collected} に集計{loaded().hledgerRevision === undefined ? "" : `・hledger ${loaded().hledgerRevision}`}
                </p>
              </>
            )}
          </Show>
        </div>
      </div>
    </MainContent>
  )
}
