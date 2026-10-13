import { createResource, createSignal, Match, Show, Switch, type JSX } from "solid-js"
import { MainContent } from "solid-gathering-shell"

import { bookStandings, type BookStanding } from "../../../application/backup"
import { clearDevice } from "../../../application/clear-device"
import type { ApplicationError } from "../../../application/errors"
import { useApp } from "../../context"
import { Button } from "../../primitives/button"
import type { Place } from "../../navigation/place"
import { describeError } from "../../wording/errors"
import { ViewHeader } from "../shell/ViewHeader"

/** Where emptying the device is: not asked, asked and waiting to be sure, going, or failed. */
type Clearing =
  | { readonly type: "resting" }
  | { readonly type: "asking" }
  | { readonly type: "clearing" }
  | { readonly type: "failed"; readonly error: ApplicationError }

const unsavedIn = (standings: readonly BookStanding[]): number => standings.filter((each) => each.standing.type !== "kept").length

/**
 * The way back to an app nobody has used: everything the device keeps is
 * emptied, and the app opened afresh onto a first book. It is for whoever
 * tried the app out before keeping a book in earnest. A press asks, beside
 * what will go and what stays, and a second does it; nothing it removes
 * can be brought back but from a backup or another device.
 */
export function ClearDataSettings(props: { readonly place: Place }): JSX.Element {
  const app = useApp()
  const [state, setState] = createSignal<Clearing>({ type: "resting" })
  const [standings] = createResource(() => app.revision(), () => bookStandings(app.services.backup))
  const unsaved = (): number => ((found) => (found?.ok === true ? unsavedIn(found.value) : 0))(standings())
  const clear = async (): Promise<void> => {
    if (state().type === "clearing") return
    setState({ type: "clearing" })
    const cleared = await clearDevice(app.services.deviceData)
    if (!cleared.ok) {
      setState({ type: "failed", error: cleared.error })
      return
    }
    window.location.replace("/")
  }
  return (
    <MainContent header={<ViewHeader place={props.place} title="データの消去" />}>
      <div class="max-w-5xl">
        <div class="flex flex-col items-start gap-3 p-4">
          <p class="text-sm text-text-muted">この端末にあるアプリのデータをすべて消して、はじめて開いたときの状態に戻します。試しに使ったあと、あらためて使い始めるときのための機能です。</p>
          <ul class="list-disc pl-5 text-sm text-text-secondary">
            <li>消えるもの：すべての帳簿と操作履歴、稼働中の記録、同期と共有の設定、テーマなどの設定</li>
            <li>残るもの：ファイルや Google ドライブに保存したバックアップ、同期しているほかの端末の帳簿</li>
          </ul>
          <Show when={state().type === "resting" || state().type === "failed"}>
            <Button variant="secondary" class="text-negative" onClick={() => setState({ type: "asking" })}>
              データを消去
            </Button>
          </Show>
          <Switch>
            <Match when={state().type === "asking" || state().type === "clearing"}>
              <div role="alert" class="flex flex-col items-start gap-3 rounded-md border border-negative/40 bg-negative/10 p-3">
                <p class="text-sm text-text-primary">
                  この端末のデータをすべて消去します。元に戻せません。
                  <Show when={unsaved() > 0}>
                    <span class="font-semibold">バックアップしていない帳簿が{unsaved()}冊あり、その記録は失われます。</span>
                  </Show>
                </p>
                <div class="flex flex-wrap gap-2">
                  <Button variant="secondary" class="text-negative" onClick={() => void clear()}>
                    {state().type === "clearing" ? "消去しています…" : "消去する"}
                  </Button>
                  <Button variant="secondary" onClick={() => setState({ type: "resting" })}>
                    やめる
                  </Button>
                </div>
              </div>
            </Match>
            <Match when={((current) => (current.type === "failed" ? current.error : undefined))(state())} keyed>
              {(error) => (
                <p role="alert" class="rounded-md border border-negative/40 bg-negative/10 px-3 py-2 text-sm text-text-primary">
                  {describeError(error)}
                </p>
              )}
            </Match>
          </Switch>
        </div>
      </div>
    </MainContent>
  )
}
