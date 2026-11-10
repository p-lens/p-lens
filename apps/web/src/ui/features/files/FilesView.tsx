import { createResource, createSignal, For, Show, type JSX } from "solid-js"
import { AuxPanel, MainContent } from "solid-gathering-shell"

import { loadBookFiles, type BookFile } from "../../../application/files"
import type { BookId } from "../../../core/book/book"
import { useApp } from "../../context"
import { ChevronDownIcon, CloseIcon } from "../../primitives/icons"
import { Revealed } from "../../primitives/revealed"
import { EmptyState, Loaded } from "../../primitives/states"
import { useMoves } from "../../navigation/moves"
import type { Place } from "../../navigation/place"
import { Withheld } from "../mummer/Withheld"
import { ViewHeader } from "../shell/ViewHeader"
import { BookDownload } from "../../../other-apps"
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
    <MainContent header={<ViewHeader place={props.place} title="生ファイル" actions={<BookDownload bookId={props.bookId} />} framed="5xl" />}>
      <Withheld kind="journal">
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
      </Withheld>
    </MainContent>
  )
}

/** Whether a file is a journal, whose amounts are signed as hledger signs them. */
const isJournal = (path: string): boolean => path.endsWith(".journal")

/**
 * How hledger signs an amount, said wherever a journal is read raw: a book keeps its accounts by double entry, so what the
 * screens show as a win is a negative number in the file. It names only the accounts a book has — a book
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
 * One file's text exactly as kept, beside the list it was chosen from, to be
 * read and no more: a book is set right on the screens made for it, whose
 * entries hold together, never by a hand in its files.
 */
export function FileDetail(props: { readonly place: Place; readonly bookId: BookId; readonly path: string }): JSX.Element {
  const app = useApp()
  const moves = useMoves()
  const [files] = createResource(
    () => ({ bookId: props.bookId, revision: app.revision() }),
    (source) => loadBookFiles(app.services.session, source.bookId),
  )
  const fileOf = (found: readonly BookFile[]): BookFile | undefined => found.find((file) => file.path === props.path)
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
      <Withheld kind="journal">
        <Loaded outcome={files()}>
          {(found) => (
            <Show when={fileOf(found)} keyed fallback={<EmptyState title="このファイルは帳簿にありません" />}>
              {(file) => (
                <div class="flex flex-col">
                  <Show when={isJournal(file.path)}>
                    <div class="px-4 pt-3">
                      <SignNote />
                    </div>
                  </Show>
                  <Show when={file.text !== ""} fallback={<EmptyState title="このファイルは空です" />}>
                    {((lines) => (
                      <Revealed count={lines.length}>{(shown) => <pre class="overflow-x-auto p-4 font-mono text-xs leading-relaxed text-text-secondary">{lines.slice(0, shown()).join("\n")}</pre>}</Revealed>
                    ))(file.text.split("\n"))}
                  </Show>
                </div>
              )}
            </Show>
          )}
        </Loaded>
      </Withheld>
    </AuxPanel>
  )
}
