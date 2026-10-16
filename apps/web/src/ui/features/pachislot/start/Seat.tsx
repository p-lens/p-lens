import { createMemo, createResource, Index, Show, type Accessor, type JSX } from "solid-js"

import { loadMachine } from "../../../../application/pachislot/formulas"
import { weighPlay } from "../../../../application/pachislot/weighing"
import { autoSelect, selectById, type Selection } from "../../../../core/formula/standing"
import { type Formula, worthOf } from "../../../../core/pachislot/formula"
import { snapshotOf } from "../../../../core/pachislot/snapshot"
import { selectPrior, type PriorSelection } from "../../../../core/pachislot/prior"
import { hasCz, resetMatters } from "../../../../core/pachislot/path"
import { counterBonusesOf, type Countable, type Weighing } from "../../../../core/pachislot/weighing"
import type { PlayTerms } from "../../../../core/parlor/terms"
import type { Checkpoint } from "../../../../core/play-log/checkpoint"
import type { Result } from "../../../../core/result/result"
import type { PachislotMachineDetail } from "../../../../core/catalog/catalog"
import { useApp } from "../../../context"
import { Loaded } from "../../../primitives/states"
import { TextField } from "../../../primitives/text-field"
import { ToggleGroup, ToggleGroupItem } from "../../../primitives/toggle-group"
import { priorName } from "../../../wording/pachislot/formula"
import { triggerWordsOf } from "../../../wording/pachislot/trigger"
import { useBookFavorites } from "../../live/book-favorites"
import { useStartForm } from "../../live/start-form"
import { OutlookPanel } from "../live/OutlookPanel"
import { readSeat, type Seat, type SeatForm, type SeatProblem, seatLineOf } from "./seat-form"

/** What the slot start form has come to for a machine from the catalog: what it is weighed by, and the seat's counter as read. */
export interface SeatState {
  readonly detail: Accessor<PachislotMachineDetail | undefined>
  readonly formulaSelection: Accessor<Selection<Formula> | undefined>
  readonly priorSelection: Accessor<PriorSelection | undefined>
  readonly weighing: Accessor<Weighing | undefined>
  readonly counterBonuses: Accessor<readonly Countable[]>
  readonly seat: Accessor<Result<Seat, readonly SeatProblem[]>>
  /** Whether the formula chosen is of an AT machine, read from the games since its last AT. */
  readonly atMachine: Accessor<boolean>
  /** The play's first line, from the seat as read, at a moment; none while the seat does not read. */
  readonly firstLine: (at: string) => Checkpoint | undefined
}

/** A machine with no tables, where nothing is weighed yet. */
const NO_MACHINE = { schemaVersion: 0, bet: 0, tables: [] }

const sameJson = <T,>(left: T, right: T): boolean => JSON.stringify(left) === JSON.stringify(right)

/**
 * The slot start form's machine from the catalog, loaded, with its formula
 * and prior chosen — by hand, or for you — and the seat's counter read. Each
 * value depends on the few fields it reads, so typing elsewhere asks nothing
 * of the catalog or the engine again.
 */
export const useSeat = (): SeatState => {
  const app = useApp()
  const start = useStartForm()
  const machineId = createMemo(() => {
    const machine = start.form().pachislot.machine
    return machine.type === "catalog" ? machine.machineId : undefined
  })
  const [loaded] = createResource(
    () => {
      const id = machineId()
      return id === undefined ? undefined : { machineId: id, revision: app.revision() }
    },
    (source) => loadMachine(app.services.catalog, source.machineId),
  )
  const detail = (): PachislotMachineDetail | undefined => {
    const found = loaded()
    return found?.ok === true && found.value.machine.id === machineId() ? found.value : undefined
  }
  const favorites = useBookFavorites()
  const chosenFormula = createMemo(() => start.form().pachislot.formulaId)
  const chosenPrior = createMemo(() => start.form().pachislot.prior)
  const formulaSelection = createMemo((): Selection<Formula> | undefined => {
    const found = detail()
    const chosen = chosenFormula()
    const kept = found === undefined ? undefined : favorites.keptAmong(found.formulas.map((listing) => listing.formula.id))
    if (found === undefined || kept === undefined) return undefined
    return (chosen === undefined ? undefined : selectById(found.formulas, chosen)) ?? autoSelect(found.formulas, worthOf, kept)
  })
  const priorSelection = createMemo((): PriorSelection | undefined => {
    const found = detail()
    const kept = found === undefined ? undefined : favorites.keptAmong(found.distributions.map((listing) => listing.formula.id))
    return found === undefined || kept === undefined ? undefined : selectPrior(found.distributions, chosenPrior(), kept)
  })
  const weighing = createMemo((): Weighing | undefined => {
    const formula = formulaSelection()?.listing.formula
    const prior = priorSelection()?.prior
    return formula === undefined || prior === undefined ? undefined : { formula: snapshotOf(formula), prior }
  })
  const atMachine = createMemo((): boolean => weighing()?.formula.normalized.atRules !== undefined)
  const counterBonuses = createMemo((): readonly Countable[] => {
    const found = weighing()
    return found === undefined || atMachine() ? [] : counterBonusesOf(found.formula)
  })
  const seatForm = createMemo(
    (): SeatForm => ({
      total: start.form().pachislot.seatTotal,
      bonuses: start.form().pachislot.seatBonuses,
      sinceBonus: start.form().startCounter,
      sinceCz: start.form().pachislot.seatSinceCz,
      misses: start.form().pachislot.seatMisses,
      held: start.form().pachislot.seatHeld,
    }),
    undefined,
    { equals: sameJson },
  )
  const seat = createMemo(() => readSeat(seatForm(), counterBonuses().map((bonus) => bonus.id)))
  const firstLine = (at: string): Checkpoint | undefined => {
    const read = seat()
    return read.ok ? seatLineOf(atMachine(), read.value, start.form().pachislot.seatAfterReset, at) : undefined
  }
  return { detail, formulaSelection, priorSelection, weighing, counterBonuses, seat, atMachine, firstLine }
}

/**
 * Whether the cabinet's settings were changed before the play, for an AT
 * machine whose ceiling is then shorter: 朝イチ after a reset, or not.
 */
function ResetChoice(): JSX.Element {
  const start = useStartForm()
  return (
    <div class="flex flex-col gap-1.5">
      <span class="text-xs font-bold uppercase tracking-wide text-text-secondary">設定変更</span>
      <ToggleGroup
        value={start.form().pachislot.seatAfterReset ? "reset" : "kept"}
        onChange={(value: string | null) => value !== null && start.updatePachislot({ seatAfterReset: value === "reset" })}
      >
        <ToggleGroupItem value="kept">なし（据え置き）</ToggleGroupItem>
        <ToggleGroupItem value="reset">あり（リセット）</ToggleGroupItem>
      </ToggleGroup>
    </div>
  )
}

const isField = (problem: SeatProblem, field: SeatProblem["field"]): boolean => JSON.stringify(problem.field) === JSON.stringify(field)

/**
 * The seat's data counter: the day's games, each bonus the formula's counter
 * shows, and the games since the last bonus. A count that cannot be read
 * says so; a bonus left empty is only nudged when starting is pressed.
 */
function SeatCounter(props: { readonly state: SeatState; readonly nudged: boolean; readonly onFocus: () => void; readonly beside: JSX.Element }): JSX.Element {
  const start = useStartForm()
  const problems = (): readonly SeatProblem[] => {
    const read = props.state.seat()
    return read.ok ? [] : read.error
  }
  const errorOf = (field: SeatProblem["field"]): string | undefined =>
    problems().some((problem) => isField(problem, field) && problem.reason === "not-a-count") ? "整数で入力してください。" : undefined
  const invalid = (field: SeatProblem["field"]): boolean => props.nudged && problems().some((problem) => isField(problem, field))
  return (
    <fieldset class="flex flex-col gap-1.5">
      <legend class="sr-only">着席時のデータ</legend>
      <div class="flex items-start gap-1.5">
        <div class="grid min-w-0 flex-1 grid-cols-2 gap-2 sm:grid-cols-4">
          <Show when={!props.state.atMachine()}>
            <TextField
              label="累計ゲーム数"
              value={start.form().pachislot.seatTotal}
              onChange={(seatTotal) => start.updatePachislot({ seatTotal })}
              inputMode="numeric"
              suffix="G"
              placeholder="0"
              error={errorOf("total")}
              invalid={invalid("total")}
              onFocus={props.onFocus}
              compact
            />
          </Show>
          <Index each={props.state.counterBonuses()}>
            {(bonus) => (
              <TextField
                label={bonus().label}
                value={start.form().pachislot.seatBonuses[bonus().id] ?? ""}
                onChange={(count) => start.updatePachislot({ seatBonuses: { ...start.form().pachislot.seatBonuses, [bonus().id]: count } })}
                inputMode="numeric"
                suffix="回"
                placeholder="0"
                error={errorOf({ bonus: bonus().id })}
                invalid={invalid({ bonus: bonus().id })}
                onFocus={props.onFocus}
                compact
              />
            )}
          </Index>
          <TextField
            label={props.state.atMachine() ? "AT間のゲーム数" : "現在ゲーム数"}
            value={start.form().startCounter}
            onChange={(startCounter) => start.update({ startCounter })}
            inputMode="numeric"
            suffix="G"
            placeholder="0"
            error={errorOf("sinceBonus")}
            onFocus={props.onFocus}
            compact
          />
          <Show when={hasCz(props.state.weighing()?.formula.normalized ?? NO_MACHINE)}>
            <TextField
              label={`${triggerWordsOf(props.state.weighing()?.formula.normalized).name}間のゲーム数`}
              value={start.form().pachislot.seatSinceCz}
              onChange={(seatSinceCz) => start.updatePachislot({ seatSinceCz })}
              inputMode="numeric"
              suffix="G"
              placeholder={start.form().startCounter === "" ? "AT間と同じ" : start.form().startCounter}
              error={errorOf("sinceCz")}
              invalid={invalid("sinceCz")}
              onFocus={props.onFocus}
              compact
            />
            <TextField
              label={`${triggerWordsOf(props.state.weighing()?.formula.normalized).name}スルー回数`}
              value={start.form().pachislot.seatMisses}
              onChange={(seatMisses) => start.updatePachislot({ seatMisses })}
              inputMode="numeric"
              suffix="回"
              placeholder="0"
              error={errorOf("misses")}
              invalid={invalid("misses")}
              onFocus={props.onFocus}
              compact
            />
          </Show>
          <Show when={props.state.weighing()?.formula.normalized.atRules?.window !== undefined}>
            <TextField
              label="引き戻し中の獲得"
              value={start.form().pachislot.seatHeld}
              onChange={(seatHeld) => start.updatePachislot({ seatHeld })}
              inputMode="numeric"
              suffix="枚"
              placeholder="引き戻し外"
              error={errorOf("held")}
              invalid={invalid("held")}
              onFocus={props.onFocus}
              compact
            />
          </Show>
        </div>
        {props.beside}
      </div>
      <Show when={props.state.atMachine() && resetMatters(props.state.weighing()?.formula.normalized ?? NO_MACHINE)}>
        <ResetChoice />
      </Show>
    </fieldset>
  )
}

/**
 * What the seat looks like before a game is played: the setting levels'
 * odds from the counter as found, under the prior chosen, and what an hour's
 * play there is worth in theory on the corner's terms.
 */
function SeatOutlook(props: { readonly weighing: Weighing; readonly line: Checkpoint; readonly terms: PlayTerms | undefined }): JSX.Element {
  const app = useApp()
  const [outlook] = createResource(
    () => ({ weighing: props.weighing, line: props.line, terms: props.terms }),
    (source) => weighPlay(app.services.pachislot, source.weighing, [source.line], source.terms),
  )
  return (
    <section class="flex flex-col gap-2">
      <h3 class="text-xs font-bold uppercase tracking-wide text-text-secondary">この台の今</h3>
      <Loaded outcome={outlook()}>{(found) => <OutlookPanel outlook={found} prior={priorName(props.weighing.prior)} />}</Loaded>
    </section>
  )
}

/**
 * The part of starting a pachislot play below its machine, formula and
 * prior — which are what it is weighed by, and stand together above: the
 * seat's counter as it was read, and what the seat looks like. Until a
 * machine is chosen the seat has its games alone.
 */
export function SeatFields(props: {
  readonly state: SeatState
  readonly terms: PlayTerms | undefined
  readonly nudged: boolean
  readonly onFocus: () => void
  /** What stands at the end of the seat's row, beside its counts: the small button for what few seats have. */
  readonly beside: JSX.Element
}): JSX.Element {
  const terms = createMemo(() => props.terms, undefined, { equals: sameJson })
  const line = createMemo(() => props.state.firstLine(""), undefined, { equals: sameJson })
  return (
    <div class="flex flex-col gap-4">
      <SeatCounter state={props.state} nudged={props.nudged} onFocus={props.onFocus} beside={props.beside} />
      <Show when={props.state.weighing()}>
        {(weighing) => <Show when={line()}>{(found) => <SeatOutlook weighing={weighing()} line={found()} terms={terms()} />}</Show>}
      </Show>
    </div>
  )
}
