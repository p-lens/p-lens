import { createEffect, on, Show, type JSX } from "solid-js"

import type { BookId } from "../../core/book/book"
import { useApp } from "../../ui/context"
import { Button } from "../../ui/primitives/button"
import { MenuButton } from "../../ui/primitives/menu-button"
import { toast } from "../../ui/primitives/toast"
import { describeError } from "../../ui/wording/errors"
import { makePlayTable, makeTogether } from "../general/use-cases"
import { EXPORT_BROKEN, EXPORT_SAVE, EXPORT_STOP } from "./export-wording"
import { createWritings, progressText, type Working } from "./writing"

/** The press a book's files are downloaded on, at the end of a screen's header. */
export const BOOK_DOWNLOAD = "ダウンロード"

/** Why a download came to nothing, said as a toast: the header has no room under it for a line. */
const toastOf = (working: Working): void => {
  if (working.type === "failed") toast({ title: "ダウンロードできませんでした", description: describeError(working.error), tone: "error" })
  if (working.type === "broken") toast({ title: EXPORT_BROKEN, tone: "error" })
}

/**
 * A book's files downloaded from a menu, for the end of a screen's header:
 * what エクスポート's まとめて zip makes of it alone — its journal, its
 * table of tallies and its plays' tables, in one zip — or its plays of one
 * game alone, as a CSV: the plays are the book's raw files' to give, not
 * エクスポート's, which writes tallies out. While a file is made,
 * how far it has got stands before the press, with 中止; a file made too
 * late to hand over waits for 保存 in its place; why it failed is a toast.
 */
export function BookDownload(props: { readonly bookId: BookId }): JSX.Element {
  const app = useApp()
  const writing = createWritings(app.services.export)("together")
  createEffect(on(writing.working, toastOf, { defer: true }))
  const working = (): Working => writing.working()
  return (
    <div class="flex shrink-0 items-center gap-2">
      <Show when={working().type === "making" || working().type === "handing"}>
        <span class="text-xs text-text-muted" role="status">
          {progressText(working())}
        </span>
      </Show>
      <Show
        when={working().type === "making"}
        fallback={
          <Show
            when={working().type === "ready"}
            fallback={
              <MenuButton
                label={BOOK_DOWNLOAD}
                choices={[
                  { label: "zip（まとめて）", onPress: () => void writing.write((watch) => makeTogether(app.services.export, [props.bookId], watch)) },
                  { label: "パチンコ稼働 CSV", onPress: () => void writing.write((watch) => makePlayTable("pachinko")(app.services.export, props.bookId, watch)) },
                  { label: "パチスロ稼働 CSV", onPress: () => void writing.write((watch) => makePlayTable("pachislot")(app.services.export, props.bookId, watch)) },
                ]}
              />
            }
          >
            <Button size="small" class="shrink-0" onClick={() => void writing.save()}>
              {EXPORT_SAVE}
            </Button>
          </Show>
        }
      >
        <Button variant="outline" size="small" class="shrink-0" onClick={() => writing.stop()}>
          {EXPORT_STOP}
        </Button>
      </Show>
    </div>
  )
}
