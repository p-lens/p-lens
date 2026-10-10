import { For, Match, Show, Switch, type JSX } from "solid-js"
import { MainContent } from "solid-gathering-shell"

import { blocksOf, type Block, type DocumentKind } from "../../../core/document/document"
import { useApp } from "../../context"
import type { Place } from "../../navigation/place"
import { EmptyState } from "../../primitives/states"
import { documentTitle } from "../../wording/documents"
import { ViewHeader } from "../shell/ViewHeader"

function BlockView(props: { readonly block: Block }): JSX.Element {
  return (
    <Switch>
      <Match when={props.block.type === "heading" && props.block} keyed>
        {(heading) => (
          <h2
            class="text-text-primary"
            classList={{ "text-lg font-bold": heading.level === 1, "mt-4 text-base font-bold": heading.level === 2, "mt-2 text-sm font-semibold": heading.level === 3 }}
          >
            {heading.text}
          </h2>
        )}
      </Match>
      <Match when={props.block.type === "paragraph" && props.block} keyed>
        {(paragraph) => <p>{paragraph.text}</p>}
      </Match>
      <Match when={props.block.type === "list" && props.block} keyed>
        {(list) => (
          <ul class="flex list-disc flex-col gap-1 pl-5">
            <For each={list.items}>{(item) => <li>{item}</li>}</For>
          </ul>
        )}
      </Match>
    </Switch>
  )
}

/**
 * One of the documents the deployment puts before people — its terms, its
 * privacy policy — at an address of its own, so it can be pointed at from
 * outside the app. What it says is the deployment's; a deployment that
 * supplies none has nothing here.
 */
export function DocumentView(props: { readonly place: Place; readonly document: DocumentKind }): JSX.Element {
  const app = useApp()
  const text = (): string | undefined => app.services.documents[props.document]
  return (
    <MainContent header={<ViewHeader place={props.place} title={documentTitle(props.document)} />}>
      <div class="max-w-3xl">
        <Show when={text()} keyed fallback={<EmptyState title={`${documentTitle(props.document)}はありません`} />}>
          {(found) => (
            <article class="flex flex-col gap-3 p-4 text-sm leading-relaxed text-text-secondary">
              <For each={blocksOf(found)}>{(block) => <BlockView block={block} />}</For>
            </article>
          )}
        </Show>
      </div>
    </MainContent>
  )
}
