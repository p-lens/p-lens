import { For, type JSX } from "solid-js"
import { MainContent } from "solid-gathering-shell"

import { useApp } from "../../context"
import { ToggleGroup, ToggleGroupItem } from "../../primitives/toggle-group"
import type { Place } from "../../navigation/place"
import { chooseRailLetters, RAIL_LETTERS, railLetters } from "../../theme/rail-letters"
import { DARK_THEMES, LIGHT_THEMES, type AppearanceChoice, type Theme } from "../../theme/theme"
import { chooseWeekStart, WEEK_STARTS, weekStart, type WeekStart } from "../../theme/week-start"
import { ViewHeader } from "../shell/ViewHeader"

const WEEK_START_NAMES: Readonly<Record<WeekStart, string>> = { sunday: "日曜", monday: "月曜" }

const APPEARANCE_CHOICES: readonly AppearanceChoice[] = ["dark", "light", "system"]

const APPEARANCE_CHOICE_NAMES: Readonly<Record<AppearanceChoice, string>> = { dark: "ダーク", light: "ライト", system: "デバイスと同じ" }

const THEME_NAMES: Readonly<Record<Theme, string>> = {
  white: "ホワイト",
  sakura: "サクラ",
  khaki: "カーキ",
  mint: "ミント",
  aurora: "オーロラ",
  ash: "アッシュ",
  onyx: "オニキス",
  bordeaux: "ボルドー",
}

/** A theme to choose, its name beside a swatch drawn in its own colours whatever theme is on screen: its panel rimmed in its accent. Packed close, so that the four dark ones, the longest names, sit in one row at 375px. */
function ThemeItem(props: { readonly theme: Theme }): JSX.Element {
  return (
    <ToggleGroupItem value={props.theme} class="gap-[3px] px-1.5">
      <span data-theme={props.theme} aria-hidden="true" class="size-2.5 shrink-0 rounded-full border-2 border-accent bg-surface-1" />
      {THEME_NAMES[props.theme]}
    </ToggleGroupItem>
  )
}

/** How the app looks on this device: whether it is light or dark — or as the device is, dark until changed — and which light and which dark theme, white and ash until changed; how many characters of a book's name stand for it on the rail, one until changed, and the day the calendars' weeks begin on, Sunday until changed. */
export function AppearanceSettings(props: { readonly place: Place }): JSX.Element {
  const { theme } = useApp()
  return (
    <MainContent header={<ViewHeader place={props.place} title="外観" />}>
      <div class="max-w-5xl">
        <div class="flex flex-col gap-6 p-4">
          <section class="flex flex-col gap-2">
            <h2 class="text-xs font-bold uppercase tracking-wide text-text-muted">モード</h2>
            <ToggleGroup
              value={theme.appearanceChoice()}
              onChange={(value: string | null) => {
                const chosen = APPEARANCE_CHOICES.find((choice) => choice === value)
                if (chosen !== undefined) theme.chooseAppearance(chosen)
              }}
              aria-label="モード"
            >
              <For each={APPEARANCE_CHOICES}>{(choice) => <ToggleGroupItem value={choice}>{APPEARANCE_CHOICE_NAMES[choice]}</ToggleGroupItem>}</For>
            </ToggleGroup>
            <p class="text-xs text-text-muted">「デバイスと同じ」は端末の設定に合わせて切り替わります。</p>
          </section>
          <section class="flex flex-col gap-2">
            <h2 class="text-xs font-bold uppercase tracking-wide text-text-muted">ライトの色</h2>
            <ToggleGroup
              value={theme.lightTheme()}
              onChange={(value: string | null) => {
                const chosen = LIGHT_THEMES.find((choice) => choice === value)
                if (chosen !== undefined) theme.chooseLightTheme(chosen)
              }}
              aria-label="ライトの色"
              class="gap-0.5"
            >
              <For each={LIGHT_THEMES}>{(choice) => <ThemeItem theme={choice} />}</For>
            </ToggleGroup>
          </section>
          <section class="flex flex-col gap-2">
            <h2 class="text-xs font-bold uppercase tracking-wide text-text-muted">ダークの色</h2>
            <ToggleGroup
              value={theme.darkTheme()}
              onChange={(value: string | null) => {
                const chosen = DARK_THEMES.find((choice) => choice === value)
                if (chosen !== undefined) theme.chooseDarkTheme(chosen)
              }}
              aria-label="ダークの色"
              class="gap-0.5"
            >
              <For each={DARK_THEMES}>{(choice) => <ThemeItem theme={choice} />}</For>
            </ToggleGroup>
            <p class="text-xs text-text-muted">テーマはこの端末に保存され、他の端末には同期されません。</p>
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
            <p class="text-xs text-text-muted">一覧に並ぶ帳簿アイコンの表示文字数。絵文字を含みます。</p>
          </section>
          <section class="flex flex-col gap-2">
            <h2 class="text-xs font-bold uppercase tracking-wide text-text-muted">週の開始曜日</h2>
            <ToggleGroup
              value={weekStart()}
              onChange={(value: string | null) => {
                const chosen = WEEK_STARTS.find((start) => start === value)
                if (chosen !== undefined) chooseWeekStart(chosen)
              }}
              aria-label="週の開始曜日"
            >
              <For each={WEEK_STARTS}>{(start) => <ToggleGroupItem value={start}>{WEEK_START_NAMES[start]}</ToggleGroupItem>}</For>
            </ToggleGroup>
            <p class="text-xs text-text-muted">カレンダーの並びに反映されます。</p>
          </section>
        </div>
      </div>
    </MainContent>
  )
}
