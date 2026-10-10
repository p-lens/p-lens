import { createSignal, Show, type JSX } from "solid-js"
import { MainContent } from "solid-gathering-shell"

import { useApp } from "../../context"
import { Button } from "../../primitives/button"
import { ConsolidatedIcon } from "../../primitives/icons"
import { toast } from "../../primitives/toast"
import { useMoves } from "../../navigation/moves"
import type { Place } from "../../navigation/place"
import { consolidationShown, showConsolidation } from "../consolidated/shown"
import { ViewHeader } from "../shell/ViewHeader"

/**
 * The switch that brings the consolidation of several books onto the rail,
 * for whoever keeps more than one: off until it is pressed, on this device
 * alone, and off again with the same button. On a phone the rail is a
 * screen away from here, so turning it on says where the consolidation now
 * is, with its mark and a way straight to it, until the person moves on
 * from this screen.
 */
export function ConsolidationSettings(props: { readonly place: Place }): JSX.Element {
  const app = useApp()
  const moves = useMoves()
  const shown = (): boolean => consolidationShown(app.services.preferences)
  /** Whether it was turned on in this visit to the screen: the news of where it went is said then, and is gone once the person moves on. */
  const [turnedOn, setTurnedOn] = createSignal(false)
  /** To the consolidation's own list, which a narrow window shows beside the rail: the mark just added to it is on screen there. */
  const open = (): void => moves.go({ kind: "consolidated" })
  const turn = (): void => {
    const on = !shown()
    showConsolidation(app.services.preferences, on)
    setTurnedOn(on)
    toast(on ? { title: "連結会計が有効になりました", description: "レールメニューに連結アイコンが追加されました。" } : { title: "連結会計を無効にしました" })
  }
  return (
    <MainContent header={<ViewHeader place={props.place} title="連結会計" />}>
      <div class="max-w-5xl">
        <div class="flex flex-col items-start gap-3 p-4">
          <p class="text-sm text-text-muted">複数の帳簿の収支を合算する「連結」を、レールメニューに出します。</p>
          <Button variant="semipro" onClick={turn}>
            {shown() ? "連結会計を無効にする" : "連結会計を有効にする"}
          </Button>
          <Show when={turnedOn()}>
            <div class="flex flex-col items-start gap-2 rounded-md bg-surface-1 p-3">
              <p class="flex items-center gap-2 text-sm text-text-secondary [&_svg]:size-5 [&_svg]:shrink-0">
                <ConsolidatedIcon />
                レールメニューに連結アイコンが追加されました。
              </p>
              <Button variant="outline" size="small" onClick={open}>
                連結を開く
              </Button>
            </div>
          </Show>
          <p class="text-xs text-text-muted">この端末だけの設定です。</p>
        </div>
      </div>
    </MainContent>
  )
}
