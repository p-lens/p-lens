import type { JSX } from "solid-js"
import { MainContent } from "solid-gathering-shell"

import { Button } from "../../primitives/button"
import { EmptyState } from "../../primitives/states"
import { useMoves } from "../../navigation/moves"
import type { Place } from "../../navigation/place"
import { ViewHeader } from "../shell/ViewHeader"

/** Any address the app has no screen for: said plainly, with a way back in. */
export function NotFound(props: { readonly place: Place; readonly path: string }): JSX.Element {
  const moves = useMoves()
  return (
    <MainContent header={<ViewHeader place={props.place} title="404" />}>
      <div class="max-w-5xl">
        <EmptyState title="ページが見つかりません">
          <p>
            <code class="break-all">{props.path}</code> に対応する画面はありません。
          </p>
          <Button class="mt-4" onClick={() => moves.go({ kind: "live" })}>
            はじめの画面へ
          </Button>
        </EmptyState>
      </div>
    </MainContent>
  )
}
