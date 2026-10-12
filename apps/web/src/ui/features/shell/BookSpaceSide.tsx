import { createSignal, Show, type JSX } from "solid-js"
import { SidePanel } from "solid-gathering-shell"

import { renameBook } from "../../../application/rename-book"
import { memberCan, type BookId, type ListedBook } from "../../../core/book/book"
import { LONGEST_TITLE, readTitle } from "../../../core/journal/title"
import { useApp } from "../../context"
import { ActivityIcon, BreakdownIcon, CloseIcon, EditIcon, FileIcon, HoldingsIcon, PlaysIcon, PlusIcon } from "../../primitives/icons"
import { toast } from "../../primitives/toast"
import { createTypedOver } from "../../primitives/typed-over"
import { useMoves } from "../../navigation/moves"
import type { BookView, Place } from "../../navigation/place"
import { RESULT_CALENDAR, ResultCalendarIcon } from "../result-calendar"
import { SideList, type SideListItem } from "./SideList"
import { bookTitle, describeTitleProblem } from "../../wording/book"
import { describeError } from "../../wording/errors"

const VIEWS: readonly { readonly view: BookView; readonly label: string; readonly icon: () => JSX.Element }[] = [
  { view: "plays", label: "稼働", icon: PlaysIcon },
  { view: "holdings", label: "貯玉・貯メダル", icon: HoldingsIcon },
  { view: "result-calendar", label: RESULT_CALENDAR, icon: ResultCalendarIcon },
  { view: "files", label: "生ファイル", icon: FileIcon },
  { view: "activity", label: "操作履歴", icon: ActivityIcon },
]

const ADD_PLAY = "記録を追加"

const viewOf = (place: Place): BookView | undefined =>
  place.kind === "book-view" ? place.view : place.kind === "play" || place.kind === "play-new" || place.kind === "play-revise" ? "plays" : place.kind === "book-file" ? "files" : undefined

const ICON_BUTTON = "flex size-7 shrink-0 items-center justify-center rounded text-text-secondary hover:bg-surface-3 hover:text-text-primary focus-visible:outline-2 focus-visible:outline-focus-ring [&_svg]:size-4"

/**
 * A book's title heading its panel, with a pencil beside it for its owner,
 * whose alone it is to name: pressed, the
 * title is typed over where it stands and kept with Enter or the pencil's
 * place, given up with Escape or the cross. A title that cannot be one is
 * said and the typing stays; nothing is written until it can.
 */
function BookTitle(props: { readonly bookId: BookId; readonly book: ListedBook }): JSX.Element {
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
    const written = await renameBook(app.services.session, props.bookId, title.value)
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
          <span class="truncate font-semibold text-text-primary">{bookTitle(props.book)}</span>
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
          classList={{ "bg-accent/30 caret-transparent": over.waiting(), "bg-surface-input": !over.waiting() }}
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

/** The side panel of one book: its title, renamed where it stands, and its views, plays first with the way to add one, and the breakdown of its results before its files, after everything that shows what it holds and made. */
export function BookSpaceSide(props: { readonly place: Place; readonly bookId: BookId; readonly book: ListedBook | undefined }): JSX.Element {
  const moves = useMoves()
  const breakdown = (): SideListItem => ({
    id: "breakdown",
    label: "集計",
    icon: <BreakdownIcon />,
    selected: props.place.kind === "book-breakdown",
    onSelect: () => moves.go({ kind: "book-breakdown", bookId: props.bookId, by: "machine" }),
  })
  const items = (): readonly SideListItem[] =>
    VIEWS.flatMap(({ view, label, icon }): readonly SideListItem[] => [
      ...(view === "files" ? [breakdown()] : []),
      {
        id: view,
        label,
        icon: icon(),
        selected: viewOf(props.place) === view,
        onSelect: () => moves.go({ kind: "book-view", bookId: props.bookId, view }),
        ...(view === "plays"
          ? { action: { label: ADD_PLAY, icon: <PlusIcon />, onSelect: () => moves.go({ kind: "play-new", bookId: props.bookId }) } }
          : {}),
      },
    ])
  return (
    <SidePanel
      header={
        <Show when={props.book} keyed fallback={<span class="truncate font-semibold text-text-primary">帳簿</span>}>
          {(book) => <BookTitle bookId={props.bookId} book={book} />}
        </Show>
      }
      resizeLabel="サイドパネルの幅を変える"
    >
      <SideList heading="ビュー" items={items()} />
    </SidePanel>
  )
}
