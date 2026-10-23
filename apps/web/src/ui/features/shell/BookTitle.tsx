import { createSignal, Show, type JSX } from "solid-js"

import { renameBook } from "../../../application/rename-book"
import { memberCan, type Book, type ListedBook } from "../../../core/book/book"
import { LONGEST_TITLE, readTitle } from "../../../core/journal/title"
import { useApp } from "../../context"
import { CloseIcon, EditIcon } from "../../primitives/icons"
import { toast } from "../../primitives/toast"
import { createTypedOver } from "../../primitives/typed-over"
import { bookTitle, describeTitleProblem, titleFieldMasked } from "../../wording/book"
import { describeError } from "../../wording/errors"

const ICON_BUTTON = "flex size-7 shrink-0 items-center justify-center rounded text-text-secondary hover:bg-surface-3 hover:text-text-primary focus-visible:outline-2 focus-visible:outline-focus-ring [&_svg]:size-4"

/**
 * A book's title where it stands — heading its panel, or on its line among
 * the device's books — with a pencil beside it for its owner, whose alone
 * it is to name: pressed, the
 * title is typed over where it stands and kept with Enter or the pencil's
 * place, given up with Escape or the cross. A title that cannot be one is
 * said and the typing stays; nothing is written until it can. How the
 * title's words are set is the place's to say.
 */
export function BookTitle(props: { readonly book: Book & Pick<ListedBook, "title">; readonly nameClass: string }): JSX.Element {
  const app = useApp()
  const [typed, setTyped] = createSignal<string | undefined>(undefined)
  const over = createTypedOver(() => true)
  const [saving, setSaving] = createSignal(false)
  const save = async (text: string): Promise<void> => {
    if (saving()) return
    const title = readTitle(text)
    if (!title.ok) {
      toast({ title: describeTitleProblem(title.error), tone: "error" })
      return
    }
    if (title.value === props.book.title) {
      setTyped(undefined)
      return
    }
    setSaving(true)
    const written = await renameBook(app.services.session, props.book.id, title.value)
    setSaving(false)
    if (!written.ok) {
      toast({ title: "帳簿の名前を変えられませんでした", description: describeError(written.error), tone: "error" })
      return
    }
    setTyped(undefined)
    app.wrote()
  }
  return (
    <Show
      when={typed() !== undefined}
      fallback={
        <div class="flex min-w-0 flex-1 items-center gap-1">
          <span class={`text-text-primary ${props.nameClass}`}>{bookTitle(props.book)}</span>
          <Show when={memberCan(props.book, app.services.member, "rename")}>
            <button type="button" class={ICON_BUTTON} onClick={() => setTyped(props.book.title ?? "")}>
              <EditIcon label="帳簿の名前を変える" />
            </button>
          </Show>
        </div>
      }
    >
      <form autocomplete="off"
        class="flex min-w-0 flex-1 items-center gap-1"
        onSubmit={(event) => {
          event.preventDefault()
          void save(typed() ?? "")
        }}
      >
        <input
          ref={(element) => queueMicrotask(() => element.focus())}
          onFocus={over.onFocus}
          onBlur={over.onBlur}
          onPointerDown={over.onPointerDown}
          onCompositionStart={over.onCompositionStart}
          onBeforeInput={over.onBeforeInput}
          aria-label="帳簿の名前"
          autocomplete="off"
          value={typed() ?? ""}
          maxLength={LONGEST_TITLE}
          onInput={(event) => setTyped(event.currentTarget.value)}
          onKeyDown={(event) => {
            over.onKeyDown(event)
            if (event.key === "Escape") setTyped(undefined)
          }}
          classList={{ "bg-accent/30 caret-transparent": over.waiting(), "bg-surface-input": !over.waiting(), "[-webkit-text-security:disc]": titleFieldMasked() }}
          class="h-8 min-w-0 flex-1 rounded-[3px] px-2 font-semibold text-text-primary outline-none focus:outline-2 focus:outline-focus-ring"
        />
        <button type="submit" class="h-8 shrink-0 rounded bg-accent px-2 text-xs font-semibold text-accent-contrast">
          保存
        </button>
        <button type="button" class={ICON_BUTTON} onClick={() => setTyped(undefined)}>
          <CloseIcon label="名前の変更をやめる" />
        </button>
      </form>
    </Show>
  )
}
