import { createResource, createSignal, For, Show, type JSX } from "solid-js"
import { AuxPanel, MainContent } from "solid-gathering-shell"

import { editFile } from "../../../application/edit-file"
import type { ApplicationError } from "../../../application/errors"
import { loadBookFiles, type BookFile } from "../../../application/files"
import type { BookId } from "../../../core/book/book"
import { useApp } from "../../context"
import { Button } from "../../primitives/button"
import { ChevronDownIcon, CloseIcon, EditIcon } from "../../primitives/icons"
import { toast } from "../../primitives/toast"
import { Revealed } from "../../primitives/revealed"
import { EmptyState, Loaded } from "../../primitives/states"
import { useMoves } from "../../navigation/moves"
import type { Place } from "../../navigation/place"
import { describeError } from "../../wording/errors"
import { ViewHeader } from "../shell/ViewHeader"
import { entriesOf, folderOf, type Listed } from "./folders"

const lineCount = (text: string): number => (text === "" ? 0 : text.replace(/\n$/, "").split("\n").length)

const selectedPath = (place: Place): string | undefined => (place.kind === "book-file" ? place.path : undefined)

/** One file of the list, under the name it goes by there: pressed, its text is shown beside. */
function FileRow(props: { readonly listed: Listed<BookFile>; readonly selected: boolean; readonly nested: boolean; readonly onOpen: () => void }): JSX.Element {
  return (
    <li>
      <button
        type="button"
        aria-current={props.selected ? "true" : undefined}
        onClick={() => props.onOpen()}
        class="flex w-full items-baseline justify-between gap-3 rounded py-2 pr-3 text-left transition-colors"
        classList={{ "bg-surface-3": props.selected, "hover:bg-surface-3/60": !props.selected, "pl-3": !props.nested, "pl-7": props.nested }}
      >
        <span class="truncate font-mono text-sm text-text-primary">{props.listed.name}</span>
        <span class="shrink-0 text-xs tabular-nums text-text-muted">{lineCount(props.listed.file.text)}行</span>
      </button>
    </li>
  )
}

/**
 * Every file a book is made of — its journals, its settings and its play
 * logs — as it is kept and as an export would carry it. Choosing one shows
 * its text beside. Files in a folder are gathered under it, shut until its
 * row is pressed, with an arrow at the row's end that points down once it
 * is open: a book that has followed many plays has as many logs, and
 * they are not what a person comes here to read first. The folder of the
 * file being shown is open whatever was pressed.
 */
export function FilesView(props: { readonly place: Place; readonly bookId: BookId }): JSX.Element {
  const app = useApp()
  const moves = useMoves()
  const [files] = createResource(
    () => ({ bookId: props.bookId, revision: app.revision() }),
    (source) => loadBookFiles(app.services.session, source.bookId),
  )
  const [opened, setOpened] = createSignal<readonly string[]>([])
  const isOpen = (folder: string): boolean => opened().includes(folder) || ((path) => path !== undefined && folderOf(path) === folder)(selectedPath(props.place))
  const toggle = (folder: string): void => {
    setOpened((now) => (now.includes(folder) ? now.filter((each) => each !== folder) : [...now, folder]))
  }
  const row = (listed: Listed<BookFile>, nested: boolean): JSX.Element => (
    <FileRow listed={listed} nested={nested} selected={selectedPath(props.place) === listed.file.path} onOpen={() => moves.go({ kind: "book-file", bookId: props.bookId, path: listed.file.path })} />
  )
  return (
    <MainContent header={<ViewHeader place={props.place} title="生ファイル" />}>
      <div class="max-w-5xl">
        <Loaded outcome={files()}>
          {(found) => (
            <Show when={found.length > 0} fallback={<EmptyState title="ファイルはありません" />}>
              <ul class="flex flex-col gap-0.5 p-2">
                <For each={entriesOf(found)}>
                  {(entry) =>
                    entry.type === "file" ? (
                      row(entry.listed, false)
                    ) : (
                      <li>
                        <button
                          type="button"
                          aria-expanded={isOpen(entry.name)}
                          onClick={() => toggle(entry.name)}
                          class="flex w-full items-center gap-2 rounded px-3 py-2 text-left transition-colors hover:bg-surface-3/60 [&_svg]:size-4"
                        >
                          <span class="min-w-0 flex-1 truncate font-mono text-sm text-text-primary">{entry.name}/</span>
                          <span class="shrink-0 text-xs tabular-nums text-text-muted">{entry.files.length}件</span>
                          <span class="shrink-0 text-text-secondary transition-transform" classList={{ "-rotate-90": !isOpen(entry.name) }}>
                            <ChevronDownIcon />
                          </span>
                        </button>
                        <Show when={isOpen(entry.name)}>
                          <ul class="flex flex-col gap-0.5 pt-0.5">
                            <For each={entry.files}>{(listed) => row(listed, true)}</For>
                          </ul>
                        </Show>
                      </li>
                    )
                  }
                </For>
              </ul>
            </Show>
          )}
        </Loaded>
      </div>
    </MainContent>
  )
}

/** Whether a file is one a person may edit by hand: a journal. A play's log is what was kept at the cabinet, and is only read. */
const isEditable = (path: string): boolean => path.endsWith(".journal")

/** Where an edit of a file is: not begun, being typed, being kept, or refused with why — the typing stays. */
type Editing =
  | { readonly type: "reading" }
  | { readonly type: "typing"; readonly text: string }
  | { readonly type: "saving"; readonly text: string }
  | { readonly type: "refused"; readonly text: string; readonly error: ApplicationError }

/**
 * How hledger signs an amount, said wherever a journal is read raw or
 * typed into: a book keeps its accounts by double entry, so what the
 * screens show as a win is a negative number in the file, and typing it
 * positive writes a loss. It names only the accounts a book has — a book
 * has no liabilities — and says of equity what a book writes there: prizes
 * taken home, which stand positive.
 */
function SignNote(): JSX.Element {
  return (
    <p class="text-xs leading-relaxed text-text-muted">
      hledger の符号：資産・費用は増えると<span class="font-semibold text-text-secondary">プラス</span>、収益は
      <span class="font-semibold text-text-secondary">マイナス</span>で書きます。勝ち分は <code class="font-mono">収益:遊技 -5000</code> のように負の数です。持ち帰った景品は{" "}
      <code class="font-mono">純資産:特殊景品 5000</code> のようにプラスで書きます。
    </p>
  )
}

/**
 * One file's text exactly as kept, beside the list it was chosen from. A
 * journal is edited where it stands: saved, the whole book is read by
 * hledger with the change before it is kept, and a parlor the list lacks or
 * a machine the catalog has none of is refused — the book's names are the
 * lists'. What is refused stays typed, with why.
 */
export function FileDetail(props: { readonly place: Place; readonly bookId: BookId; readonly path: string }): JSX.Element {
  const app = useApp()
  const moves = useMoves()
  const [files] = createResource(
    () => ({ bookId: props.bookId, revision: app.revision() }),
    (source) => loadBookFiles(app.services.session, source.bookId),
  )
  const [editing, setEditing] = createSignal<Editing>({ type: "reading" })
  const fileOf = (found: readonly BookFile[]): BookFile | undefined => found.find((file) => file.path === props.path)
  const typed = (): string | undefined => {
    const current = editing()
    return current.type === "reading" ? undefined : current.text
  }
  const refusal = (): ApplicationError | undefined => {
    const current = editing()
    return current.type === "refused" ? current.error : undefined
  }
  const save = async (text: string): Promise<void> => {
    if (editing().type === "saving") return
    setEditing({ type: "saving", text })
    const written = await editFile(app.services.session, { parlors: app.services.parlors, submissions: app.services.submissions, catalog: app.services.catalog }, props.bookId, props.path, text)
    if (!written.ok) {
      setEditing({ type: "refused", text, error: written.error })
      return
    }
    setEditing({ type: "reading" })
    toast({ title: "保存しました", description: props.path })
    app.wrote()
  }
  return (
    <AuxPanel
      header={
        <div class="flex min-w-0 flex-1 items-center gap-2">
          <h2 class="min-w-0 flex-1 truncate font-mono text-sm font-semibold text-text-primary">{props.path}</h2>
          <button
            type="button"
            class="flex size-8 items-center justify-center rounded text-text-secondary hover:bg-surface-3 hover:text-text-primary"
            onClick={() => moves.up(props.place)}
          >
            <CloseIcon label="閉じる" />
          </button>
        </div>
      }
      resizeLabel="詳細パネルの幅を変える"
    >
      <Loaded outcome={files()}>
        {(found) => (
          <Show when={fileOf(found)} keyed fallback={<EmptyState title="このファイルは帳簿にありません" />}>
            {(file) => (
              <Show
                when={typed() !== undefined}
                fallback={
                  <div class="flex flex-col">
                    <Show when={isEditable(file.path)}>
                      <div class="flex items-start justify-between gap-3 px-4 pt-3">
                        <div class="min-w-0 flex-1">
                          <SignNote />
                        </div>
                        <button
                          type="button"
                          class="flex shrink-0 items-center gap-1.5 rounded border border-border px-2.5 py-1 text-xs text-text-secondary hover:border-text-secondary hover:text-text-primary [&_svg]:size-4"
                          onClick={() => setEditing({ type: "typing", text: file.text })}
                        >
                          <EditIcon label="" />
                          編集
                        </button>
                      </div>
                    </Show>
                    <Show when={file.text !== ""} fallback={<EmptyState title="このファイルは空です" />}>
                      {((lines) => (
                        <Revealed count={lines.length}>{(shown) => <pre class="overflow-x-auto p-4 font-mono text-xs leading-relaxed text-text-secondary">{lines.slice(0, shown()).join("\n")}</pre>}</Revealed>
                      ))(file.text.split("\n"))}
                    </Show>
                  </div>
                }
              >
                <form autocomplete="off"
                  class="flex h-full flex-col gap-3 p-4"
                  onSubmit={(event) => {
                    event.preventDefault()
                    void save(typed() ?? "")
                  }}
                >
                  <SignNote />
                  <textarea
                    aria-label={`${file.path} の内容`}
                    value={typed() ?? ""}
                    onInput={(event) => setEditing({ type: "typing", text: event.currentTarget.value })}
                    spellcheck={false}
                    wrap="off"
                    class="min-h-80 flex-1 resize-y overflow-auto rounded-[3px] bg-surface-input p-3 font-mono text-xs leading-relaxed text-text-primary outline-none focus:outline-2 focus:outline-focus-ring"
                  />
                  <Show when={refusal()} keyed>
                    {(error) => (
                      <p role="alert" class="rounded-md border border-negative/40 bg-negative/10 px-3 py-2 text-sm text-text-primary">
                        {describeError(error)}
                      </p>
                    )}
                  </Show>
                  <p class="text-xs text-text-muted">保存すると hledger が帳簿全体を読み直します。読めない内容や、一覧にない店舗名・機種名は保存されません。</p>
                  <div class="flex gap-2">
                    <Button type="submit">{editing().type === "saving" ? "保存中…" : "保存"}</Button>
                    <Button variant="ghost" onClick={() => setEditing({ type: "reading" })}>
                      やめる
                    </Button>
                  </div>
                </form>
              </Show>
            )}
          </Show>
        )}
      </Loaded>
    </AuxPanel>
  )
}
