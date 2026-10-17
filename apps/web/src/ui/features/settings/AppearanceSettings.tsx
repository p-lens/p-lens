import { For, type JSX } from "solid-js"
import { MainContent } from "solid-gathering-shell"

import { useApp } from "../../context"
import { ToggleGroup, ToggleGroupItem } from "../../primitives/toggle-group"
import type { Place } from "../../navigation/place"
import { chooseRailLetters, RAIL_LETTERS, railLetters } from "../../theme/rail-letters"
import type { ThemeChoice } from "../../theme/theme"
import { ViewHeader } from "../shell/ViewHeader"

const isThemeChoice = (value: string | null): value is ThemeChoice => value === "dark" || value === "light" || value === "system"

/** How the app looks on this device: its theme — dark, light, or whatever the device uses, dark until changed — and how many characters of a book's name stand for it on the rail, one until changed. */
export function AppearanceSettings(props: { readonly place: Place }): JSX.Element {
  const { theme } = useApp()
  return (
    <MainContent header={<ViewHeader place={props.place} title="外観" />}>
      <div class="max-w-5xl">
        <div class="flex flex-col gap-6 p-4">
          <section class="flex flex-col gap-2">
            <h2 class="text-xs font-bold uppercase tracking-wide text-text-muted">テーマ</h2>
            <ToggleGroup
              value={theme.choice()}
              onChange={(value: string | null) => {
                if (isThemeChoice(value)) theme.choose(value)
              }}
              aria-label="テーマ"
            >
              <ToggleGroupItem value="dark">ダーク</ToggleGroupItem>
              <ToggleGroupItem value="light">ライト</ToggleGroupItem>
              <ToggleGroupItem value="system">自動</ToggleGroupItem>
            </ToggleGroup>
          </section>
          <section class="flex flex-col gap-2">
            <h2 class="text-xs font-bold uppercase tracking-wide text-text-muted">帳簿アイコンの文字数</h2>
            <ToggleGroup
              value={String(railLetters())}
              onChange={(value: string | null) => {
                const chosen = RAIL_LETTERS.find((letters) => String(letters) === value)
                if (chosen !== undefined) chooseRailLetters(chosen)
              }}
              aria-label="帳簿アイコンの文字数"
            >
              <For each={RAIL_LETTERS}>{(letters) => <ToggleGroupItem value={String(letters)}>{letters}文字</ToggleGroupItem>}</For>
            </ToggleGroup>
            <p class="text-xs text-text-muted">左の一覧に並ぶ帳簿を、名前のはじめの何文字で表すかです。絵文字も1文字に数えます。</p>
          </section>
        </div>
      </div>
    </MainContent>
  )
}
