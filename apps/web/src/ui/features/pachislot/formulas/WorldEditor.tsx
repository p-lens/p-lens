import { createSignal, Index, Show, untrack, type JSX } from "solid-js"

import { Button } from "../../../primitives/button"
import { TrashIcon } from "../../../primitives/icons"
import { Select, type SelectOption } from "../../../primitives/select"
import { TextField } from "../../../primitives/text-field"
import { ToggleGroup, ToggleGroupItem } from "../../../primitives/toggle-group"
import { bonusTitle } from "../../../wording/pachislot/formula"
import {
  ALL_SETTING_LEVELS,
  type AtLawForm,
  EMPTY_LAW,
  EMPTY_OTHER_NET,
  EMPTY_PAYOUT_ROW,
  type PayoutRowForm,
  type PayoutShape,
  type EntityKindName,
  type EntityRow,
  hasCz,
  hasModes,
  isAtMachine,
  type ManualForm,
  newRow,
  STARTING_AT_MANUAL,
  STARTING_MANUAL,
  type WorldForm,
} from "./world-form"

const KINDS: readonly SelectOption[] = [
  { value: "bonus", label: "ボーナス" },
  { value: "part", label: "ボーナスの内訳（単独・重複）" },
  { value: "role", label: "小役" },
  { value: "replay", label: "リプレイ" },
  { value: "watch", label: "ボーナス中に見る場面" },
  { value: "cue", label: "示唆" },
]

const isKind = (value: string): value is EntityKindName => KINDS.some((kind) => kind.value === value)

const replaced = <T,>(items: readonly T[], index: number, item: T): readonly T[] => items.map((existing, at) => (at === index ? item : existing))

const LABEL = "text-xs font-bold uppercase tracking-wide text-text-secondary"

/** Which setting levels the machine has: all six, or some of them. */
function LevelPicker(props: { readonly levels: readonly number[]; readonly onChange: (levels: readonly number[]) => void }): JSX.Element {
  return (
    <div class="flex flex-col gap-1.5">
      <span class={LABEL}>設定</span>
      <ToggleGroup
        multiple
        value={props.levels.map(String)}
        onChange={(values: string[]) => props.onChange(ALL_SETTING_LEVELS.filter((level) => values.includes(String(level))))}
      >
        <Index each={ALL_SETTING_LEVELS}>{(level) => <ToggleGroupItem value={String(level())}>{level()}</ToggleGroupItem>}</Index>
      </ToggleGroup>
    </div>
  )
}

/** A value for each setting level, side by side: a chance, or a 機械割. */
function LevelCells(props: {
  readonly name: string
  readonly levels: readonly number[]
  readonly values: Readonly<Record<string, string>>
  readonly suffix?: string
  readonly placeholder: string
  readonly onChange: (values: Readonly<Record<string, string>>) => void
}): JSX.Element {
  return (
    <div class="grid grid-cols-3 gap-2 sm:grid-cols-6">
      <Index each={props.levels}>
        {(level) => (
          <TextField
            label={`${props.name} 設定${level()}`}
            labelHidden
            compact
            value={props.values[String(level())] ?? ""}
            onChange={(value) => props.onChange({ ...props.values, [String(level())]: value })}
            inputMode="decimal"
            placeholder={`設定${level()} ${props.placeholder}`}
            {...(props.suffix === undefined ? {} : { suffix: props.suffix })}
          />
        )}
      </Index>
    </div>
  )
}

/**
 * A CZ's ceilings and スルー天井, behind its 合算 and success rate: open once
 * asked for, or while one of them is typed. Its ceilings are its modes' on a
 * machine of modes.
 */
function CzDepths(props: { readonly row: EntityRow; readonly form: WorldForm; readonly onChange: (row: EntityRow) => void }): JSX.Element {
  const [asked, setAsked] = createSignal(false)
  const typed = (): boolean => [props.row.ceiling, props.row.resetCeiling, props.row.misses].some((text) => text.trim() !== "")
  return (
    <Show
      when={asked() || typed()}
      fallback={
        <div>
          <Button variant="ghost" size="small" onClick={() => setAsked(true)}>
            CZの天井・スルー天井を入れる
          </Button>
        </div>
      }
    >
      <div class="flex flex-wrap items-end gap-3">
        <Show when={!hasModes(props.form)}>
          <div class="w-28">
            <TextField label="CZ天井" value={props.row.ceiling} onChange={(ceiling) => props.onChange({ ...props.row, ceiling })} inputMode="numeric" suffix="G" placeholder="なし" />
          </div>
          <div class="w-36">
            <TextField
              label="リセット後のCZ天井"
              value={props.row.resetCeiling}
              onChange={(resetCeiling) => props.onChange({ ...props.row, resetCeiling })}
              inputMode="numeric"
              suffix="G"
              placeholder="同じ"
            />
          </div>
        </Show>
        <div class="w-36">
          <TextField
            label="スルー天井"
            value={props.row.misses}
            onChange={(misses) => props.onChange({ ...props.row, misses })}
            inputMode="numeric"
            suffix="回"
            placeholder="なし"
          />
        </div>
        <p class="basis-full text-xs text-text-muted">スルー天井は、AT後にCZをこの回数失敗すると次のCZで必ずATに当たる、という回数です。</p>
      </div>
    </Show>
  )
}

function RowEditor(props: {
  readonly row: EntityRow
  readonly form: WorldForm
  /** Typed in by hand: only bonuses, and a payout that may be left out. */
  readonly manual: boolean
  readonly onChange: (row: EntityRow) => void
  readonly onRemove: () => void
}): JSX.Element {
  const bonuses = (): readonly SelectOption[] =>
    props.form.rows.filter((row) => row.kind === "bonus").map((row, index) => ({ value: row.key, label: bonusTitle(row.label, index + 1) }))
  const watches = (): readonly SelectOption[] =>
    props.form.rows.filter((row) => row.kind === "watch").map((row, index) => ({ value: row.key, label: row.label.trim() === "" ? `場面${index + 1}` : row.label }))
  const split = (): boolean => props.row.kind === "bonus" && props.form.rows.some((row) => row.kind === "part" && row.of === props.row.key)
  /** Whether the row is asked its medals: a bonus and an AT; a small win where its medals are its own, never on a sheet typed in by hand, whose small wins are counted on an AT machine and pay through its ベース. */
  const paid = (): boolean => props.row.kind === "bonus" || props.row.kind === "at" || (props.row.kind === "role" && !props.manual)
  const brought = (): boolean => props.row.kind === "at" && hasCz(props.form)
  const fixed = (): boolean => props.row.kind === "at" || props.row.kind === "cz"
  const name = (fallback: string): string => (props.row.label.trim() === "" ? fallback : props.row.label)
  const payoutLabel = (): string => {
    if (props.row.kind === "at") return "平均獲得枚数"
    if (props.manual) return "獲得枚数（任意）"
    return props.row.kind === "bonus" ? "獲得枚数" : "払い出し"
  }
  return (
    <section class="flex flex-col gap-3 rounded-lg border border-border px-4 py-3">
      <div class="flex flex-wrap items-end gap-2">
        <div class="min-w-24 flex-1">
          <TextField label="名前" value={props.row.label} onChange={(label) => props.onChange({ ...props.row, label })} placeholder="BIG・ブドウ…" />
        </div>
        <Show when={!props.manual && !fixed()}>
          <div class="w-28">
            <Select
              label="種類"
              placeholder="種類"
              options={KINDS}
              value={props.row.kind}
              onChange={(kind) => {
                if (isKind(kind)) props.onChange({ ...props.row, kind })
              }}
            />
          </div>
        </Show>
        <Show when={props.row.kind === "part"}>
          <div class="min-w-32 flex-1">
            <Select label="どのボーナスの内訳か" placeholder="ボーナス" options={bonuses()} value={props.row.of} onChange={(of) => props.onChange({ ...props.row, of })} />
          </div>
        </Show>
        <Show when={props.row.kind === "watch"}>
          <div class="min-w-32 flex-1">
            <Select label="どのボーナスで見るか" placeholder="ボーナス" options={bonuses()} value={props.row.of} onChange={(of) => props.onChange({ ...props.row, of })} />
          </div>
          <div class="w-36">
            <TextField
              label="ボーナス1回の回数"
              value={props.row.trials}
              onChange={(trials) => props.onChange({ ...props.row, trials })}
              inputMode="numeric"
              suffix="回"
              placeholder="1"
            />
          </div>
        </Show>
        <Show when={props.row.kind === "cue"}>
          <div class="min-w-32 flex-1">
            <Select label="どの場面の示唆か" placeholder="場面" options={watches()} value={props.row.of} onChange={(of) => props.onChange({ ...props.row, of })} />
          </div>
        </Show>
        <Show when={paid() && (props.row.kind !== "at" || props.row.law.shape === "average")}>
          <div class="w-28">
            <TextField
              label={payoutLabel()}
              value={props.row.payout}
              onChange={(payout) => props.onChange({ ...props.row, payout })}
              inputMode="decimal"
              suffix="枚"
            />
          </div>
        </Show>
        <Show when={(props.row.kind === "at" && !brought() && !hasModes(props.form)) || props.row.kind === "mode"}>
          <div class="w-28">
            <TextField
              label={props.row.kind === "mode" && hasCz(props.form) ? "CZ天井" : "天井"}
              value={props.row.ceiling}
              onChange={(ceiling) => props.onChange({ ...props.row, ceiling })}
              inputMode="numeric"
              suffix="G"
              placeholder="なし"
            />
          </div>
        </Show>
        <Show when={props.row.kind === "mode" && hasCz(props.form)}>
          <div class="w-28">
            <TextField
              label="AT間天井"
              value={props.row.atCeiling}
              onChange={(atCeiling) => props.onChange({ ...props.row, atCeiling })}
              inputMode="numeric"
              suffix="G"
              placeholder="ATと同じ"
            />
          </div>
        </Show>
        <Show when={brought()}>
          <div class="w-36">
            <TextField
              label="AT間天井（任意）"
              value={props.row.ceiling}
              onChange={(ceiling) => props.onChange({ ...props.row, ceiling })}
              inputMode="numeric"
              suffix="G"
              placeholder="なし"
            />
          </div>
        </Show>
        <Show when={brought() && !hasModes(props.form)}>
          <div class="w-40">
            <TextField
              label="リセット後のAT間天井"
              value={props.row.resetCeiling}
              onChange={(resetCeiling) => props.onChange({ ...props.row, resetCeiling })}
              inputMode="numeric"
              suffix="G"
              placeholder="同じ"
            />
          </div>
        </Show>
        <Show when={props.row.kind === "at" && !brought() && !hasModes(props.form)}>
          <div class="w-36">
            <TextField
              label="リセット後の天井"
              value={props.row.resetCeiling}
              onChange={(resetCeiling) => props.onChange({ ...props.row, resetCeiling })}
              inputMode="numeric"
              suffix="G"
              placeholder="同じ"
            />
          </div>
        </Show>
        <Show when={props.row.kind !== "at"}>
          <Button variant="outline" size="icon" class="ml-auto" aria-label={`${name("この行")}を削除`} title="この行を削除" onClick={() => props.onRemove()}>
            <TrashIcon />
          </Button>
        </Show>
      </div>
      <Show when={props.row.kind === "at" && !brought()}>
        <p class="text-xs text-text-muted">初当たりは解析サイトの公表値（天井込み）をそのまま入れてください。</p>
      </Show>
      <Show when={brought()}>
        <p class="text-xs text-text-muted">ATの初当たりは、CZ合算と成功率・天井から正確に計算します。</p>
      </Show>
      <Show when={props.row.kind === "watch"}>
        <p class="text-xs text-text-muted">ボーナス1回で何回見るかを入れます。BIG中のスイカならBIGのゲーム数、REG中のランプなら1回です。示唆の確率は、その1回あたりで入れてください。</p>
      </Show>
      <Show when={props.row.kind === "cz"}>
        <span class={LABEL}>CZ合算（公表値・天井込み）</span>
        <LevelCells name={`${name("CZ")} 合算`} levels={props.form.settingLevels} values={props.row.chances} placeholder="1/" onChange={(chances) => props.onChange({ ...props.row, chances })} />
        <span class={LABEL}>CZ成功率</span>
        <LevelCells
          name={`${name("CZ")} 成功率`}
          levels={props.form.settingLevels}
          values={props.row.success}
          suffix="%"
          placeholder=""
          onChange={(success) => props.onChange({ ...props.row, success })}
        />
        <CzDepths row={props.row} form={props.form} onChange={props.onChange} />
      </Show>
      <Show
        when={props.row.kind !== "mode" && props.row.kind !== "cz" && props.row.kind !== "watch" && !brought()}
        fallback={
          <Show when={props.row.kind === "mode"}>
            <div class="flex flex-col gap-2">
              <span class={LABEL}>AT後の振り分け</span>
              <LevelCells
                name={`${props.row.label.trim() === "" ? "モード" : props.row.label} 振り分け`}
                levels={props.form.settingLevels}
                values={props.row.chances}
                suffix="%"
                placeholder=""
                onChange={(chances) => props.onChange({ ...props.row, chances })}
              />
              <span class={LABEL}>リセット時の振り分け（任意）</span>
              <LevelCells
                name={`${props.row.label.trim() === "" ? "モード" : props.row.label} リセット時の振り分け`}
                levels={props.form.settingLevels}
                values={props.row.resetAllotment}
                suffix="%"
                placeholder="同じ"
                onChange={(resetAllotment) => props.onChange({ ...props.row, resetAllotment })}
              />
            </div>
          </Show>
        }
      >
        <Show when={!split()} fallback={<p class="text-xs text-text-muted">確率は内訳の合計です。</p>}>
          <LevelCells
            name={props.row.label.trim() === "" ? "確率" : props.row.label}
            levels={props.form.settingLevels}
            values={props.row.chances}
            placeholder="1/"
            onChange={(chances) => props.onChange({ ...props.row, chances })}
          />
        </Show>
      </Show>
    </section>
  )
}

function Rows(props: { readonly form: WorldForm; readonly manual: boolean; readonly onChange: (form: WorldForm) => void }): JSX.Element {
  return (
    <Index each={props.form.rows}>
      {(row, index) => (
        <RowEditor
          row={row()}
          form={props.form}
          manual={props.manual}
          onChange={(changed) => props.onChange({ ...props.form, rows: replaced(props.form.rows, index, changed) })}
          onRemove={() => props.onChange({ ...props.form, rows: props.form.rows.filter((_, at) => at !== index) })}
        />
      )}
    </Index>
  )
}

const ADDABLE: readonly { readonly kind: EntityKindName; readonly label: string }[] = [
  { kind: "bonus", label: "ボーナスを追加" },
  { kind: "part", label: "内訳を追加" },
  { kind: "role", label: "小役を追加" },
  { kind: "replay", label: "リプレイを追加" },
  { kind: "watch", label: "見る場面を追加" },
  { kind: "cue", label: "示唆を追加" },
]

/**
 * A machine's 解析値: its setting levels, its bet, and each entity — a bonus,
 * a part of one, a small win, a replay, or what is watched over a bonus and
 * the cues it shows — with its chance under each level.
 * Chances are typed as an analysis sheet prints them: `1/273.1` or `16%`.
 */
export function WorldEditor(props: { readonly form: WorldForm; readonly onChange: (form: WorldForm) => void }): JSX.Element {
  return (
    <div class="flex flex-col gap-4">
      <div class="flex flex-wrap items-end gap-4">
        <LevelPicker levels={props.form.settingLevels} onChange={(settingLevels) => props.onChange({ ...props.form, settingLevels })} />
        <div class="w-28">
          <TextField label="1Gの枚数" value={props.form.bet} onChange={(bet) => props.onChange({ ...props.form, bet })} inputMode="numeric" suffix="枚" />
        </div>
      </div>
      <Rows form={props.form} manual={false} onChange={props.onChange} />
      <div class="flex flex-wrap gap-2">
        <Index each={ADDABLE}>
          {(addable) => (
            <Button variant="secondary" size="small" onClick={() => props.onChange({ ...props.form, rows: [...props.form.rows, newRow(props.form.rows, addable().kind)] })}>
              {addable().label}
            </Button>
          )}
        </Index>
      </div>
    </div>
  )
}

/**
 * A machine whose AT a CZ now brings: a CZ row, placed after the AT, and the
 * AT's own 初当たり and ceiling after a setting change let go — the CZ's
 * figures give them.
 */
const withCz = (form: WorldForm): WorldForm => {
  const cz: EntityRow = { ...newRow(form.rows, "cz"), label: "CZ" }
  const rows = form.rows.flatMap((each) => (each.kind === "at" ? [{ ...each, chances: {}, ceiling: "", resetCeiling: "" }, cz] : [each]))
  return { ...form, rows }
}

const SHAPES: readonly { readonly value: PayoutShape; readonly label: string }[] = [
  { value: "average", label: "平均獲得枚数" },
  { value: "sets", label: "初期＋継続率" },
  { value: "table", label: "枚数の表" },
  { value: "rate", label: "機械割から" },
]

const isShape = (value: string): value is PayoutShape => SHAPES.some((shape) => shape.value === value)

/** Whether anything past an AT's average has been typed, so its depths start open; once open, they stay as the person leaves them. */
const typedDepths = (world: WorldForm, law: AtLawForm): boolean =>
  law.shape !== "average" || law.window.trim() !== "" || law.resetOnCap || world.cap.trim() !== ""

/** An AT's table of medals: a row for each so many medals, with how often each level gives it. */
function PayoutRows(props: { readonly world: WorldForm; readonly law: AtLawForm; readonly onChange: (law: AtLawForm) => void }): JSX.Element {
  const setRows = (rows: readonly PayoutRowForm[]): void => props.onChange({ ...props.law, rows })
  return (
    <div class="flex flex-col gap-3">
      <Index each={props.law.rows}>
        {(row, index) => (
          <div class="flex flex-col gap-2 rounded-md border border-border px-3 py-2">
            <div class="flex items-end gap-3">
              <div class="w-32">
                <TextField
                  label={`${index + 1}行目の枚数`}
                  value={row().medals}
                  onChange={(medals) => setRows(replaced(props.law.rows, index, { ...row(), medals }))}
                  inputMode="decimal"
                  suffix="枚"
                />
              </div>
              <Button variant="ghost" size="small" onClick={() => setRows(props.law.rows.filter((_, at) => at !== index))}>
                削除
              </Button>
            </div>
            <LevelCells
              name={`${index + 1}行目`}
              levels={props.world.settingLevels}
              values={row().shares}
              suffix="%"
              placeholder=""
              onChange={(shares) => setRows(replaced(props.law.rows, index, { ...row(), shares }))}
            />
          </div>
        )}
      </Index>
      <div>
        <Button variant="secondary" size="small" onClick={() => setRows([...props.law.rows, EMPTY_PAYOUT_ROW])}>
          行を追加
        </Button>
      </div>
    </div>
  )
}

/**
 * What an AT gains past its average, and its 有利区間, folded behind the AT
 * and open once anything in it is typed: its medals as sets carried on at a
 * 継続率 or as a table, the cap on what a 有利区間 gains, the games it carries
 * on after an AT short of the cap, and how play starts again once an AT
 * reaches it.
 */
function AtDepths(props: { readonly world: WorldForm; readonly onChange: (world: WorldForm) => void }): JSX.Element {
  const index = (): number => props.world.rows.findIndex((row) => row.kind === "at")
  const law = (): AtLawForm => props.world.rows[index()]?.law ?? EMPTY_LAW
  const setLaw = (changed: AtLawForm): void => {
    const at = props.world.rows[index()]
    if (at !== undefined) props.onChange({ ...props.world, rows: replaced(props.world.rows, index(), { ...at, law: changed }) })
  }
  const startsOpen = untrack(() => typedDepths(props.world, law()))
  return (
    <details class="rounded-lg border border-border px-4 py-3" open={startsOpen}>
      <summary class="cursor-pointer text-sm font-semibold text-text-secondary">獲得の分布・有利区間</summary>
      <div class="mt-3 flex flex-col gap-4">
        <div class="flex flex-col gap-1.5">
          <span class={LABEL}>ATの獲得</span>
          <ToggleGroup value={law().shape} onChange={(value: string | null) => value !== null && isShape(value) && setLaw({ ...law(), shape: value })}>
            <Index each={SHAPES}>{(shape) => <ToggleGroupItem value={shape().value}>{shape().label}</ToggleGroupItem>}</Index>
          </ToggleGroup>
        </div>
        <Show when={law().shape === "sets"}>
          <div class="flex flex-wrap items-end gap-3">
            <div class="w-32">
              <TextField label="初期枚数" value={law().first} onChange={(first) => setLaw({ ...law(), first })} inputMode="decimal" suffix="枚" />
            </div>
            <div class="w-32">
              <TextField label="1セットの枚数" value={law().set} onChange={(set) => setLaw({ ...law(), set })} inputMode="decimal" suffix="枚" />
            </div>
          </div>
          <span class={LABEL}>継続率</span>
          <LevelCells name="継続率" levels={props.world.settingLevels} values={law().continuationRate} suffix="%" placeholder="" onChange={(continuationRate) => setLaw({ ...law(), continuationRate })} />
        </Show>
        <Show when={law().shape === "table"}>
          <PayoutRows world={props.world} law={law()} onChange={setLaw} />
        </Show>
        <Show when={law().shape === "rate"}>
          <div class="flex items-end gap-2">
            <div class="w-32">
              <TextField label="純増" value={law().net} onChange={(net) => setLaw({ ...law(), net })} inputMode="decimal" suffix="枚/G" />
            </div>
            <Button variant="secondary" size="small" onClick={() => setLaw({ ...law(), otherNets: [...law().otherNets, EMPTY_OTHER_NET] })}>
              別の純増を追加
            </Button>
          </div>
          <Index each={law().otherNets}>
            {(other, index) => (
              <div class="grid grid-cols-[8rem_minmax(0,1fr)_2.25rem] items-end gap-2 [&>*]:min-w-0">
                <TextField label="別の純増" labelHidden={index > 0} value={other().net} onChange={(net) => setLaw({ ...law(), otherNets: law().otherNets.map((each, at) => (at === index ? { ...each, net } : each)) })} inputMode="decimal" suffix="枚/G" />
                <TextField label="獲得枚数のうち" labelHidden={index > 0} value={other().share} onChange={(share) => setLaw({ ...law(), otherNets: law().otherNets.map((each, at) => (at === index ? { ...each, share } : each)) })} inputMode="decimal" suffix="%" />
                <Button variant="outline" size="icon" aria-label={`別の純増${index + 1}を削除`} title="この純増を削除" onClick={() => setLaw({ ...law(), otherNets: law().otherNets.filter((_, at) => at !== index) })}>
                  <TrashIcon />
                </Button>
              </div>
            )}
          </Index>
          <p class="text-xs text-text-muted">
            平均獲得枚数は、各設定の機械割・初当たり・ベースと純増から計算します。ATからATまでの通常ゲームとATのゲームを通して、払い出しの総数を投入の総数で割ると機械割になる、という関係を獲得枚数について解いたものです。上位ATなど純増の違う区間があるATは、その純増と、ATの獲得枚数のうちそこで取る割合を「別の純増」に入れます。残りは上の純増で取るものとして、同じ枚数にかかるゲーム数を合わせます。
          </p>
        </Show>
        <Show when={law().shape === "sets" || law().shape === "table"}>
          <p class="text-xs text-text-muted">平均獲得枚数は、この分布と有利区間の上限から計算します。</p>
        </Show>
        <div class="flex flex-wrap items-end gap-3">
          <div class="w-40">
            <TextField
              label="有利区間の上限"
              value={props.world.cap}
              onChange={(cap) => props.onChange({ ...props.world, cap })}
              inputMode="numeric"
              suffix="枚"
              placeholder="なし"
            />
          </div>
          <div class="w-40">
            <TextField
              label="引き戻しのゲーム数"
              value={law().window}
              onChange={(window) => setLaw({ ...law(), window })}
              inputMode="numeric"
              suffix="G"
              placeholder="なし"
            />
          </div>
        </div>
        <div class="flex flex-col gap-1.5">
          <span class={LABEL}>完走したあと</span>
          <ToggleGroup value={law().resetOnCap ? "reset" : "at"} onChange={(value: string | null) => value !== null && setLaw({ ...law(), resetOnCap: value === "reset" })}>
            <ToggleGroupItem value="at">AT後と同じ</ToggleGroupItem>
            <ToggleGroupItem value="reset">リセット後と同じ</ToggleGroupItem>
          </ToggleGroup>
        </div>
        <p class="text-xs text-text-muted">
          有利区間の上限（例: 2400枚）に届いたATはそこで終わり、有利区間も終わります。届かずに終わったATの獲得は、引き戻しのゲーム数のあいだ持ち越され、その間に当たったATはその分だけ早く上限に届きます。上限・引き戻し・完走後の扱いは、上限を入れたときだけ使います。
        </p>
      </div>
    </details>
  )
}

const BONUS_MACHINE = "bonus"
const AT_MACHINE = "at"

/**
 * What a typed-in machine is: one of bonuses — BIG, REG and the like — or of
 * an AT with its ceiling and ベース. Choosing the other starts its rows over,
 * keeping the setting levels and the 機械割 typed.
 */
function MachineShape(props: { readonly form: ManualForm; readonly onChange: (form: ManualForm) => void }): JSX.Element {
  const shape = (): string => (isAtMachine(props.form.world) ? AT_MACHINE : BONUS_MACHINE)
  const choose = (value: string): void => {
    if (value === shape()) return
    const start = value === AT_MACHINE ? STARTING_AT_MANUAL : STARTING_MANUAL
    props.onChange({ ...props.form, world: { ...start.world, settingLevels: props.form.world.settingLevels, bet: props.form.world.bet } })
  }
  return (
    <div class="flex flex-col gap-1.5">
      <span class={LABEL}>機種のタイプ</span>
      <ToggleGroup value={shape()} onChange={(value: string | null) => value !== null && choose(value)}>
        <ToggleGroupItem value={BONUS_MACHINE}>ボーナス機</ToggleGroupItem>
        <ToggleGroupItem value={AT_MACHINE}>AT機</ToggleGroupItem>
      </ToggleGroup>
    </div>
  )
}

/**
 * A formula typed in by hand: its setting levels, its bonuses' odds — their
 * payout may be left out — and what is watched over them, or its AT's, with the AT's payout, its ceilings
 * and the machine's ベース; and each level's 機械割 as published or measured.
 */
export function ManualEditor(props: { readonly form: ManualForm; readonly onChange: (form: ManualForm) => void }): JSX.Element {
  const world = (): WorldForm => props.form.world
  const setWorld = (changed: WorldForm): void => props.onChange({ ...props.form, world: changed })
  return (
    <div class="flex flex-col gap-4">
      <MachineShape form={props.form} onChange={props.onChange} />
      <div class="flex flex-wrap items-end gap-4">
        <LevelPicker levels={world().settingLevels} onChange={(settingLevels) => setWorld({ ...world(), settingLevels })} />
        <Show when={isAtMachine(world())}>
          <div class="w-36">
            <TextField label="ベース" value={world().base} onChange={(base) => setWorld({ ...world(), base })} inputMode="decimal" suffix="G/50枚" />
          </div>
          <div class="w-44">
            <TextField
              label="液晶の加算（任意）"
              value={world().lcdRate}
              onChange={(lcdRate) => setWorld({ ...world(), lcdRate })}
              inputMode="decimal"
              suffix="倍"
              placeholder="なし"
            />
          </div>
        </Show>
      </div>
      <section class="flex flex-col gap-2 rounded-lg border border-border px-4 py-3">
        <span class={LABEL}>機械割</span>
        <LevelCells name="機械割" levels={world().settingLevels} values={props.form.rates} suffix="%" placeholder="" onChange={(rates) => props.onChange({ ...props.form, rates })} />
      </section>
      <Rows form={world()} manual onChange={setWorld} />
      <Show when={isAtMachine(world())}>
        <AtDepths world={world()} onChange={setWorld} />
      </Show>
      <Show when={isAtMachine(world())}>
        <p class="text-xs text-text-muted">
          天井の液晶ゲーム数がスイカなどで加算される機種は、液晶のゲーム数÷実ゲーム数の平均（例: 1.6倍）を入れると、天井を実ゲーム数に直して計算します。モードを足すと、天井はモードごとに入れます。小役は、通常時に数える設定差のあるもの（共通ベルなど）を設定ごとの確率で入れます。払い出しはベースに含まれるので枚数は入れず、CZやATに直結する小役（強チェリーなど）は入れないでください。
        </p>
      </Show>
      <div class="flex flex-wrap gap-2">
        <Show when={isAtMachine(world()) && !hasCz(world())}>
          <Button variant="secondary" size="small" onClick={() => setWorld(withCz(world()))}>
            CZを追加
          </Button>
        </Show>
        <Show when={isAtMachine(world())}>
          <Button variant="secondary" size="small" onClick={() => setWorld({ ...world(), rows: [...world().rows, newRow(world().rows, "role")] })}>
            小役を追加
          </Button>
        </Show>
        <Button
          variant="secondary"
          size="small"
          onClick={() => setWorld({ ...world(), rows: [...world().rows, newRow(world().rows, isAtMachine(world()) ? "mode" : "bonus")] })}
        >
          {isAtMachine(world()) ? "モードを追加" : "ボーナスを追加"}
        </Button>
        <Show when={!isAtMachine(world())}>
          <Button variant="secondary" size="small" onClick={() => setWorld({ ...world(), rows: [...world().rows, newRow(world().rows, "watch")] })}>
            見る場面を追加
          </Button>
          <Button variant="secondary" size="small" onClick={() => setWorld({ ...world(), rows: [...world().rows, newRow(world().rows, "cue")] })}>
            示唆を追加
          </Button>
        </Show>
      </div>
    </div>
  )
}
