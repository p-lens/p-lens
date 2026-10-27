import { createResource, createSignal, Show, type JSX } from "solid-js"
import { MainContent } from "solid-gathering-shell"

import type { ApplicationError } from "../../../../application/errors"
import { loadFormula } from "../../../../application/pachislot/formulas"
import { bookNameOf } from "../../../../core/catalog/catalog"
import { usesWeighTheirMost, type Mark } from "../../../../core/formula/standing"
import type { Formula, Sampling } from "../../../../core/pachislot/formula"
import { selectPrior, type Prior } from "../../../../core/pachislot/prior"
import type { PachislotFormulaDetail } from "../../../../core/catalog/catalog"
import { useApp } from "../../../context"
import { Button, NerdproLink } from "../../../primitives/button"
import { BoltIcon, HandIcon, HandOffIcon, HeartIcon, ShieldIcon, ShieldOffIcon } from "../../../primitives/icons"
import { Loaded } from "../../../primitives/states"
import { useMoves } from "../../../navigation/moves"
import type { Place } from "../../../navigation/place"
import { formulaIdText } from "../../../wording/catalog"
import { describeError } from "../../../wording/errors"
import { formatCount } from "../../../wording/numbers"
import { kindName, UNCHECKED } from "../../../wording/pachislot/formula"
import { useBookFavorites } from "../../live/book-favorites"
import { useStartForm } from "../../live/start-form"
import { ViewHeader } from "../../shell/ViewHeader"
import { FiguresTable } from "./FiguresTable"
import { HuntTable } from "./HuntTable"
import { remadeIn } from "./remaking"
import { trailTo } from "./trail"
import { useActions } from "./use-actions"
import { ValueSheet } from "./ValueSheet"
import { isMine, OWN_LINES, paintOf } from "./vote-fill"

const samplingOf = (formula: Formula): Sampling | undefined => (formula.kind === "sampled" ? formula.sampling : undefined)

/**
 * One pachislot 算出条件: each setting level's 機械割 and bonus odds, at an
 * AT machine 天井狙い down a table, how it was made, and what people have
 * done with it. Adopting it as one's own is
 * done here, a level below where most people stop. Its 期待値算出 is laid
 * over it while `valueShown`, weighed by the prior a play of it would
 * start with; using the formula from there welcomes the device, as a
 * person come in from outside to that sheet is never greeted over it.
 */
export function FormulaView(props: { readonly place: Place; readonly machineId: string; readonly formulaId: string; readonly valueShown: boolean }): JSX.Element {
  const app = useApp()
  const moves = useMoves()
  const start = useStartForm()
  const actions = useActions()
  const favorites = useBookFavorites()
  /** Whether the person's own mark is among a formula's count of it. */
  const own = (mark: Mark, formulaId: string): boolean => isMine(mark, actions.mine(formulaId), favorites.keeps(formulaId))
  /** A count's look: drawn in the text's own colour inside its painted icon where the person's own mark is among it. */
  const countLook = (mark: Mark, formulaId: string): string => `flex items-center gap-1 [&_svg]:size-4 ${own(mark, formulaId) ? OWN_LINES : ""}`
  const [failure, setFailure] = createSignal<ApplicationError | undefined>(undefined)
  const [detail] = createResource(
    () => ({ machineId: props.machineId, formulaId: props.formulaId, revision: app.revision() }),
    (source) => loadFormula(app.services.catalog, source.machineId, source.formulaId),
  )
  const trail = () => {
    const found = detail()
    return found?.ok === true ? trailTo(moves, "formula", found.value.machine, found.value.listing.formula) : undefined
  }
  const valuePlace = (): Place => ({ kind: "pachislot-formula-value", machineId: props.machineId, formulaId: props.formulaId })
  /** The prior the start form would weigh a play of this machine by: the one chosen there for it by hand, else a book's favourite, else the ordinary day's. */
  const priorOf = (found: PachislotFormulaDetail): Prior | undefined => {
    const kept = favorites.keptAmong(found.distributions.map((listing) => listing.formula.id))
    const chosen = start.form().pachislot
    const byHand = chosen.machine.type === "catalog" && chosen.machine.machineId === found.machine.id ? chosen.prior : undefined
    return kept === undefined ? undefined : selectPrior(found.distributions, byHand, kept).prior
  }
  return (
    <MainContent header={<ViewHeader place={props.place} title="算出条件" trail={trail()} />}>
      <div class="max-w-5xl">
        <Loaded outcome={detail()}>
          {(found) => {
            const listing = () => found.listing
            const formula = () => found.listing.formula
            return (
              <div class="flex flex-col gap-5 p-4">
                <FiguresTable figures={formula().figures} sampling={samplingOf(formula())} />
                <Show when={formula().basis.normalized.atRules !== undefined}>
                  <HuntTable basis={formula().basis} />
                </Show>
                <dl class="flex flex-wrap gap-x-6 gap-y-1 text-sm">
                  <div class="flex gap-2"><dt class="text-text-muted">種類</dt><dd class="text-text-primary">{kindName(formula().kind)}</dd></div>
                  <Show when={formula().unchecked}>
                    <div class="flex gap-2"><dt class="text-text-muted">共有カタログ</dt><dd class="text-text-primary">{UNCHECKED}</dd></div>
                  </Show>
                  <Show when={samplingOf(formula())} keyed>
                    {(sampling) => (
                      <>
                        <div class="flex gap-2"><dt class="text-text-muted">試行</dt><dd class="tabular-nums text-text-primary">設定ごとに {formatCount(sampling.gamesPerSettingLevel)}G（±は95%）</dd></div>
                        <div class="flex gap-2"><dt class="text-text-muted">シード</dt><dd class="tabular-nums text-text-primary">{sampling.seed}</dd></div>
                      </>
                    )}
                  </Show>
                  <div class="flex gap-2"><dt class="text-text-muted">ID</dt><dd class="tabular-nums text-text-primary">{formulaIdText(formula().id)}</dd></div>
                </dl>
                <div class="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-text-secondary">
                  <span class={countLook("verification", formula().id)}><ShieldIcon paint={paintOf("verification", own("verification", formula().id))} /> 検証OK {listing().standing.verifications}</span>
                  <span class={countLook("refutation", formula().id)}><ShieldOffIcon paint={paintOf("refutation", own("refutation", formula().id))} /> 検証NG {listing().standing.refutations}</span>
                  <span class={countLook("adoption", formula().id)}><HandIcon paint={paintOf("adoption", own("adoption", formula().id))} /> イチオシ {listing().standing.adoptions}</span>
                  <span class={countLook("rejection", formula().id)}><HandOffIcon paint={paintOf("rejection", own("rejection", formula().id))} /> 非推奨 {listing().standing.rejections}</span>
                  <span class={countLook("favorite", formula().id)}><HeartIcon filled={own("favorite", formula().id)} /> お気に入り {listing().standing.favorites}</span>
                  <span class="flex items-center gap-1 [&_svg]:size-4" classList={{ [OWN_LINES]: usesWeighTheirMost(listing().standing) }}><BoltIcon filled={usesWeighTheirMost(listing().standing)} /> 利用 {listing().standing.uses}回</span>
                </div>
                <Show when={failure()} keyed>
                  {(error) => <p role="alert" class="text-sm text-negative">{describeError(error)}</p>}
                </Show>
                <div class="flex flex-wrap gap-2">
                  <Button variant="amateur" onClick={() => actions.useFormula(formula(), bookNameOf(found.machine))}>
                    これを使う
                  </Button>
                  <ValueSheet
                    formula={formula()}
                    prior={priorOf(found)}
                    open={props.valueShown}
                    onOpen={() => moves.go(valuePlace())}
                    onClosed={() => moves.up(valuePlace())}
                    onUse={() => {
                      app.services.welcome.setWelcomed()
                      actions.useFormula(formula(), bookNameOf(found.machine))
                    }}
                  />
                </div>
                <div class="flex flex-wrap gap-2">
                  <Button
                    variant={actions.mine(formula().id).adopted ? "primary" : "secondary"}
                    aria-pressed={actions.mine(formula().id).adopted}
                    onClick={() => actions.toggle("formula", listing(), "adoption", setFailure)}
                  >
                    {actions.mine(formula().id).adopted ? "イチオシ中" : "イチオシにする"}
                  </Button>
                  <Button variant={actions.mine(formula().id).rejected ? "primary" : "secondary"} aria-pressed={actions.mine(formula().id).rejected} onClick={() => actions.toggle("formula", listing(), "rejection", setFailure)}>
                    {actions.mine(formula().id).rejected ? "非推奨中" : "非推奨にする"}
                  </Button>
                </div>
                <p class="text-xs text-text-muted">イチオシは1機種につき1つ。人にすすめるならこれ、という算出条件に付けてください。すすめられないものは非推奨に。どちらも共有され、順位に効きます。</p>
                <div class="flex flex-wrap items-center gap-x-4 gap-y-2">
                  <Button
                    variant="nerdpro"
                    onClick={() => {
                      start.updatePachislot({ machine: { type: "catalog", machineId: found.machine.id, name: bookNameOf(found.machine) }, remakeFrom: formula().id })
                      moves.go({ kind: "pachislot-formula-new", tab: remadeIn(formula()) })
                    }}
                  >
                    作り直す
                  </Button>
                  <NerdproLink class="text-sm" onClick={() => moves.go({ kind: "pachislot-formula-grounds", machineId: found.machine.id, formulaId: formula().id })}>
                    計算根拠を見る ›
                  </NerdproLink>
                </div>
              </div>
            )
          }}
        </Loaded>
      </div>
    </MainContent>
  )
}
