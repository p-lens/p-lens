import type { JSX } from "solid-js"
import { MainContent } from "solid-gathering-shell"

import { useApp } from "../../context"
import { ToggleGroup, ToggleGroupItem } from "../../primitives/toggle-group"
import type { Place } from "../../navigation/place"
import type { ThemeChoice } from "../../theme/theme"
import { ViewHeader } from "../shell/ViewHeader"

const isThemeChoice = (value: string | null): value is ThemeChoice => value === "dark" || value === "light" || value === "system"

/** Dark, light, or whatever the device uses: one choice of three, dark until changed. */
export function AppearanceSettings(props: { readonly place: Place }): JSX.Element {
  const { theme } = useApp()
  return (
    <MainContent header={<ViewHeader place={props.place} title="テーマ" />}>
      <div class="max-w-5xl">
        <div class="flex flex-col gap-6 p-4">
          <section class="flex flex-col gap-2">
            <h2 class="text-xs font-bold uppercase tracking-wide text-text-muted">外観</h2>
            <ToggleGroup
              value={theme.choice()}
              onChange={(value: string | null) => {
                if (isThemeChoice(value)) theme.choose(value)
              }}
              aria-label="外観"
            >
              <ToggleGroupItem value="dark">ダーク</ToggleGroupItem>
              <ToggleGroupItem value="light">ライト</ToggleGroupItem>
              <ToggleGroupItem value="system">自動</ToggleGroupItem>
            </ToggleGroup>
          </section>
        </div>
      </div>
    </MainContent>
  )
}
