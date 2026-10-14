import { For, Match, Show, Switch, type JSX } from "solid-js"

import { bookNameOf } from "../../../core/catalog/catalog"
import { machineMatches } from "../../../core/catalog/description"
import * as Pachinko from "../../../core/pachinko"
import { identityKey } from "../../../core/parlor/parlor"
import type { PlayGameKind } from "../../../core/play/play"
import { Button } from "../../primitives/button"
import { Combobox } from "../../primitives/combobox"
import { DetailButton } from "../../primitives/detail-button"
import { PlusIcon } from "../../primitives/icons"
import { redText } from "../../primitives/nudge"
import { PencilledBubble } from "../../primitives/pencilled-bubble"
import { Select } from "../../primitives/select"
import { TextField } from "../../primitives/text-field"
import { ToggleGroup, ToggleGroupItem } from "../../primitives/toggle-group"
import { describeError } from "../../wording/errors"
import * as PachinkoWording from "../../wording/pachinko/inference"
import { LOCATE_REQUEST, typedMachineRefused, typedParlorRefused } from "../../wording/parlor"
import * as PachinkoViews from "../pachinko"
import type { SubmitWords } from "./form"
import type { YenTallyEditing } from "./yen-tally-editing"
import { HOUR_CHOICES, hoursOfMinutes, MINUTE_CHOICES, minutesToldIn } from "./yen-tally-form"

const SUBMIT_PARLOR = "一覧にない店舗を申請する"

const ROUND_BUTTON = "flex size-10 shrink-0 items-center justify-center rounded-full border-2 border-border text-text-secondary hover:border-text-secondary hover:text-text-primary [&_svg]:size-5"

/** What a form's rows are kept to on a screen with room: half the form's width, as a play started live gives its parlor — a name, or a pair of sums with what they come to under them, being read better short of a whole row. */
const HALF_ON_A_WIDE_SCREEN = "sm:w-[calc(50%-0.25rem)]"

const isGameKind = (value: string | null): value is PlayGameKind => value === "pachinko" || value === "slot"

/** The day a play is said to have been played, and how long it lasted, in hours and five minutes. */
export function DayAndHours(props: { readonly editing: YenTallyEditing }): JSX.Element {
  const editing = props.editing
  return (
    <div class="flex items-end gap-3">
      <div class="w-40">
        <TextField label="日付" type="date" value={editing.form().date} onChange={editing.set("date")} error={editing.problemOf("date")}
          invalid={editing.nudged("date")}
          onFocus={editing.nudge.settle} required />
      </div>
      <div class="flex items-end gap-1">
        <div class="w-[5.25rem]">
          <Select
            label="稼働時間"
            options={HOUR_CHOICES.map((hours) => ({ value: String(hours), label: `${hours}時間` }))}
            value={((minutes) => (minutes === undefined ? undefined : String(Math.floor(minutes / 60))))(minutesToldIn(editing.form()))}
            onChange={(hours) => editing.set("hours")(hoursOfMinutes(Number(hours) * 60 + ((minutesToldIn(editing.form()) ?? 0) % 60)))}
            placeholder="-時間"
            invalid={editing.lacked("hours")}
            onFocus={editing.weighNudge.settle}
          />
        </div>
        <div class="w-[4.5rem]">
          <Select
            label="稼働時間の分"
            labelHidden
            options={MINUTE_CHOICES.map((minutes) => ({ value: String(minutes), label: `${minutes}分` }))}
            value={((minutes) => (minutes === undefined ? undefined : String(minutes % 60)))(minutesToldIn(editing.form()))}
            onChange={(minutes) => editing.set("hours")(hoursOfMinutes(Math.floor((minutesToldIn(editing.form()) ?? 0) / 60) * 60 + Number(minutes)))}
            placeholder="-分"
            invalid={editing.lacked("hours")}
            onFocus={editing.weighNudge.settle}
          />
        </div>
      </div>
    </div>
  )
}

/** The parlor a play was at, chosen and never typed, with the way to submit one the list lacks. */
export function ParlorField(props: { readonly editing: YenTallyEditing }): JSX.Element {
  const editing = props.editing
  return (
    <div class={`flex flex-col gap-1.5 ${HALF_ON_A_WIDE_SCREEN}`}>
      <div class="flex min-w-0 items-end gap-2">
        <div class="min-w-0 flex-1">
          <Combobox
            label="店舗"
            placeholder="指定しない"
            options={editing.offers().map((offer) => ({ value: identityKey(offer.parlor.identity), label: offer.parlor.name, note: offer.note, foundFirst: offer.unplaced !== undefined }))}
            value={editing.form().parlorKey === "" ? undefined : editing.form().parlorKey}
            onChange={(key) => editing.set("parlorKey")(key ?? "")}
            matches={(key, typed) => editing.offerOf().get(key)?.matches(typed) ?? false}
            invalid={editing.typedOnly() || editing.nudged("parlor")}
            onFocus={editing.nudge.settle}
            onTyped={editing.setParlorTyped}
          />
        </div>
        <button
          type="button"
          aria-label={SUBMIT_PARLOR}
          title={SUBMIT_PARLOR}
          tabIndex={-1}
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => editing.submitParlor()}
          class={ROUND_BUTTON}
        >
          <PlusIcon />
        </button>
      </div>
      <Show when={editing.locating()} keyed>
        {(address) => (
          <a href={address} class="animate-[emerge_1.6s_ease-out] text-xs text-text-secondary underline underline-offset-2 hover:text-text-primary">
            {LOCATE_REQUEST}
          </a>
        )}
      </Show>
      <Show when={editing.typedOnly()}>
        <p role="alert" class="text-xs text-negative">
          {typedParlorRefused(editing.refused)}
        </p>
      </Show>
    </div>
  )
}

/** Which game a play was: pachinko or pachislot, whose catalog its machine is chosen from. */
export function GameKindField(props: { readonly editing: YenTallyEditing }): JSX.Element {
  const editing = props.editing
  return (
    <div class="flex flex-col gap-1.5">
      <span class="text-xs font-bold uppercase tracking-wide text-text-secondary">種別</span>
      <ToggleGroup
        value={editing.form().gameKind}
        onChange={(value: string | null) => {
          if (isGameKind(value) && value !== editing.form().gameKind) editing.switchGame(value)
        }}
        aria-label="種別"
      >
        <ToggleGroupItem value="pachinko">パチンコ</ToggleGroupItem>
        <ToggleGroupItem value="slot">スロット</ToggleGroupItem>
      </ToggleGroup>
    </div>
  )
}

/** The catalog's machines of the play's game to choose from, with its cabinet's number beside it. */
function MachineChoice(props: { readonly editing: YenTallyEditing }): JSX.Element {
  const editing = props.editing
  return (
    <Combobox
      label="機種"
      placeholder="指定しない"
      options={editing.machines().map((machine) => ({ value: bookNameOf(machine), label: machine.name, ...(machine.hitChance === undefined ? {} : { note: machine.hitChance }) }))}
      value={editing.form().machine === "" ? undefined : editing.form().machine}
      onChange={(name) => editing.set("machine")(name ?? "")}
      matches={(name, typed) => editing.machines().some((machine) => bookNameOf(machine) === name && machineMatches(machine, typed))}
      invalid={editing.machineTypedOnly() || editing.lacked("machine")}
      onFocus={() => {
        editing.nudge.settle()
        editing.weighNudge.settle()
      }}
      onTyped={editing.setMachineTyped}
      beside={
        <PencilledBubble text={`${editing.form().cabinetNumber.trim() === "" ? "---" : editing.form().cabinetNumber.trim()}番台`} says="台番号を入力する" invalid={false}>
          <TextField label="台番号" value={editing.form().cabinetNumber} onChange={editing.set("cabinetNumber")} inputMode="numeric" compact />
        </PencilledBubble>
      }
    />
  )
}

/** The machine a play was on, one of the catalog's of its game or none: a field of its own for each game, so nothing typed for the one stands in the other's. */
export function MachineField(props: { readonly editing: YenTallyEditing }): JSX.Element {
  const editing = props.editing
  return (
    <div class={`flex flex-col gap-1.5 ${HALF_ON_A_WIDE_SCREEN}`}>
      <Show when={editing.form().gameKind} keyed>
        {(_gameKind) => <MachineChoice editing={editing} />}
      </Show>
      <Show when={editing.machineTypedOnly()}>
        <p role="alert" class="text-xs text-negative">
          {typedMachineRefused(editing.refused)}
        </p>
      </Show>
    </div>
  )
}

/** The two sides of a tally in yen, and the theoretical value a person may type in beside them. */
export function SidesFields(props: { readonly editing: YenTallyEditing }): JSX.Element {
  const editing = props.editing
  return (
    <div class={`grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] items-start gap-x-3 ${HALF_ON_A_WIDE_SCREEN}`}>
      <TextField label="投資額" value={editing.form().outlay} onChange={editing.set("outlay")} inputMode="decimal" suffix="円" error={editing.problemOf("outlay")}
        invalid={editing.nudged("outlay") || editing.lacked("outlay")}
        onFocus={() => {
          editing.nudge.settle()
          editing.weighNudge.settle()
        }} required />
      <TextField label="回収額" value={editing.form().takings} onChange={editing.set("takings")} inputMode="decimal" suffix="円" error={editing.problemOf("takings")}
        invalid={editing.nudged("takings")}
        onFocus={editing.nudge.settle} />
      <DetailButton
        label="期待値"
        says={editing.form().theoreticalValue.trim() === "" ? "期待値を入力する" : `期待値 ${editing.form().theoreticalValue.trim()}円`}
        marked={editing.form().theoreticalValue.trim() !== ""}
        invalid={editing.problemAt("theoretical-value") !== undefined || editing.lacked("theoretical")}
        tone="semipro"
        placement="bottom-end"
        onOpen={editing.weighNudge.settle}
      >
        <div class="min-w-0 flex-1">
          <TextField label="期待値" value={editing.form().theoreticalValue} onChange={editing.set("theoreticalValue")} inputMode="decimal" suffix="円" invalid={editing.problemAt("theoretical-value") !== undefined} onFocus={editing.nudge.settle} compact />
        </div>
      </DetailButton>
    </div>
  )
}

/** What a pachinko play is weighed on beside its form: the jackpots, and the rental and exchange of its corner. */
function WeighingTermsButton(props: { readonly editing: YenTallyEditing }): JSX.Element {
  const editing = props.editing
  return (
    <DetailButton
      label="条件"
      says="推定の条件（大当り回数・レートと交換率）"
      marked={editing.weighingSet()}
      invalid={editing.problemAt("jackpots") !== undefined}
      beckoning={editing.jackpotsAsked()}
      glimmering={editing.jackpotsWouldSharpen()}
      placement="bottom-end"
    >
      <div class="flex min-w-0 flex-1 flex-col gap-3">
        <TextField label="大当り回数" value={editing.form().jackpots} onChange={editing.set("jackpots")} inputMode="numeric" suffix="回" invalid={editing.problemAt("jackpots") !== undefined} onFocus={editing.nudge.settle} compact />
        <ToggleGroup
          value={String(editing.form().weighingTerms.rental)}
          onChange={(value: string | null) => {
            const rental = Pachinko.TOKEN_RENTALS.find((each) => String(each) === value)
            if (rental !== undefined) editing.set("weighingTerms")(Pachinko.withRental(editing.form().weighingTerms, rental))
          }}
          aria-label="貸玉レート"
        >
          <For each={Pachinko.TOKEN_RENTALS}>{(rental) => <ToggleGroupItem value={String(rental)}>{PachinkoWording.RENTAL_NAMES[rental]}</ToggleGroupItem>}</For>
        </ToggleGroup>
        <ToggleGroup
          value={editing.form().weighingTerms.exchange}
          onChange={(value: string | null) => {
            const exchange = Pachinko.EXCHANGES_AT[editing.form().weighingTerms.rental].find((each) => each === value)
            if (exchange !== undefined) editing.set("weighingTerms")({ ...editing.form().weighingTerms, exchange })
          }}
          aria-label="交換率"
          class="flex-nowrap"
        >
          <For each={Pachinko.EXCHANGES_AT[editing.form().weighingTerms.rental]}>
            {(exchange) => (
              <ToggleGroupItem value={exchange} class="px-1.5">
                {PachinkoWording.exchangeChoiceText({ rental: editing.form().weighingTerms.rental, exchange })}
              </ToggleGroupItem>
            )}
          </For>
        </ToggleGroup>
      </div>
    </DetailButton>
  )
}

/** What the two sides come to, and — for a pachinko play — the press that infers what it was worth, with what it is inferred on and what it came to. */
export function ResultAndWeighing(props: { readonly editing: YenTallyEditing }): JSX.Element {
  const editing = props.editing
  return (
    <>
      <div class={`flex items-end gap-2 ${HALF_ON_A_WIDE_SCREEN}`}>
        <div class="flex min-w-0 flex-1 flex-col gap-1.5">
          <span class="text-xs font-bold uppercase tracking-wide text-text-secondary">実収支</span>
          <output class="flex h-10 items-center text-lg font-bold tabular-nums" classList={{ "text-positive": editing.resultTone() === "positive", "text-negative": editing.resultTone() === "negative", "text-text-primary": editing.resultTone() === "neutral", "text-text-muted": editing.resultTone() === undefined }}>
            {editing.resultText()}
          </output>
        </div>
        <Show when={editing.form().gameKind === "pachinko"}>
          <Show
            when={editing.weighing().type !== "weighing"}
            fallback={
              <output aria-live="polite" class="flex h-9 shrink-0 items-center whitespace-nowrap px-4 text-sm font-medium text-amateur">
                {PachinkoWording.weighButtonText(editing.weighing())}
              </output>
            }
          >
            <Button type="button" variant="outline" class="shrink-0 text-amateur hover:text-amateur" onClick={() => editing.weigh()}>
              {PachinkoWording.weighButtonText(editing.weighing())}
            </Button>
          </Show>
          <WeighingTermsButton editing={editing} />
        </Show>
      </div>
      <Show when={editing.form().gameKind === "pachinko" && editing.weighing().type !== "resting"}>
        <div class={HALF_ON_A_WIDE_SCREEN}>
          <PachinkoViews.WeighingLine weighing={editing.weighing()} />
          <Show when={editing.jackpotsWouldSharpen()}>
            <p class="mt-1.5 animate-[emerge_1.6s_ease-out] text-xs text-warning">{PachinkoWording.JACKPOTS_SHARPEN}</p>
          </Show>
        </div>
      </Show>
    </>
  )
}

/** The foot of the form: that savings stay as they are, the entry it writes, why it was refused, and the press that records it. */
export function EntryAndSubmit(props: { readonly editing: YenTallyEditing; readonly words: SubmitWords }): JSX.Element {
  const editing = props.editing
  return (
    <>
      <p class="text-xs text-text-muted">貯玉・貯メダルの残高は動きません。</p>
      <section class="flex flex-col gap-2">
        <h2 class="text-xs font-bold uppercase tracking-wide text-text-muted">書き込まれる仕訳</h2>
        <Switch fallback={<p class="text-sm text-text-muted">入力を直すと、ここに仕訳が表示されます。</p>}>
          <Match when={editing.previewText()}>
            {(text) => <pre class="overflow-x-auto rounded-md bg-surface-0 p-3 font-mono text-xs leading-relaxed text-text-secondary">{text()}</pre>}
          </Match>
          <Match when={editing.previewProblem()} keyed>
            {(problem) => (
              <p class="text-sm" classList={redText(editing.nudge.red())}>
                {problem}
              </p>
            )}
          </Match>
        </Switch>
      </section>
      <Show when={editing.failure()} keyed>
        {(error) => (
          <div role="alert" class="rounded-md border border-negative/40 bg-negative/10 px-4 py-3 text-sm text-text-primary">
            {describeError(error)}
          </div>
        )}
      </Show>
      <div>
        <Button type="submit">
          {editing.saving() ? props.words.busy : editing.weighing().type === "weighing" ? "推定中…" : props.words.idle}
        </Button>
      </div>
    </>
  )
}
