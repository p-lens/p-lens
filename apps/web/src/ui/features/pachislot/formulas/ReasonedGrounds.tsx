import type { AnalysisDto } from "@p-lens/contracts/pachislot"
import { createResource, For, type JSX } from "solid-js"

import { reasonGrounds } from "../../../../application/pachislot/grounds"
import type { Basis } from "../../../../core/pachislot/formula"
import { useApp } from "../../../context"
import { Loaded } from "../../../primitives/states"
import { groundsLines } from "../../../wording/pachislot/grounds"

/**
 * An AT machine's figures reasoned out from its basis by the Prolog
 * reasoner: under each setting level, what the AT gains and how the 機械割
 * comes of it, each step indented under what it supports, and the checks
 * against the engine and the stated 機械割 marked held or failed.
 */
export function ReasonedGrounds(props: { readonly basis: Basis; readonly analysis: AnalysisDto }): JSX.Element {
  const app = useApp()
  const [proof] = createResource(
    () => ({ basis: props.basis, analysis: props.analysis }),
    (source) => reasonGrounds(app.services.pachislotReasoner, source.basis, source.analysis),
  )
  return (
    <section class="flex flex-col gap-2" aria-label="推論した計算根拠">
      <h2 class="text-xs font-bold uppercase tracking-wide text-text-muted">計算根拠（推論）</h2>
      <Loaded outcome={proof()}>
        {(found) => (
          <ol class="flex flex-col gap-1 rounded-lg border border-border px-4 py-3 text-sm">
            <For each={groundsLines(found)}>
              {(line) => (
                <li
                  class="tabular-nums"
                  style={{ "padding-left": `${line.depth * 0.75}rem` }}
                  classList={{ "text-text-secondary": line.tone === "plain", "text-positive": line.tone === "holds", "text-negative": line.tone === "fails" }}
                >
                  {line.tone === "holds" ? "✓ " : line.tone === "fails" ? "✗ " : ""}
                  {line.text}
                </li>
              )}
            </For>
          </ol>
        )}
      </Loaded>
      <p class="text-xs text-text-muted">解析値と計算エンジンの値を事実として、推論エンジン（Prolog）が規則から導いた根拠です。</p>
    </section>
  )
}
