import type { EngineErrorDto } from "@p-lens/contracts/pachislot"

import type { ObservationProblem } from "../../../core/pachislot/observation"
import type { PriorProblem } from "../../../core/pachislot/prior"
import type { EngineFailure } from "../../../pachislot-engine/protocol/messages"
import { priorName } from "./formula"

const settingLevel = (value: number): string => `設定${value}`

const COMPONENT_NAMES: Readonly<Record<string, string>> = {
  label: "名前",
  chance: "確率",
  payout: "払い出し枚数",
  bonus: "ボーナスの印",
  replay: "リプレイの印",
  partOf: "内訳の指定",
  at: "ATの印",
  firstHit: "初当たり",
  ceiling: "天井",
  resetCeiling: "リセット後の天井",
  mode: "モードの印",
  allotment: "モード振り分け",
  resetAllotment: "リセット時のモード振り分け",
  atCeiling: "モードのAT間天井",
  cz: "CZの印",
  success: "CZ成功率",
  misses: "スルー天井",
  sets: "セットごとの枚数",
  continuationRate: "継続率",
  payoutTable: "獲得枚数の表",
  netPerGame: "純増",
  otherNet: "別の純増",
  rate: "機械割",
  window: "引き戻しのゲーム数",
  resetOnCap: "完走後のリセット",
  watch: "ボーナス中に見る場面",
  trials: "ボーナス1回の回数",
  cue: "示唆",
}

/** A component by what the person entering a spec calls it. */
const componentName = (component: string): string => COMPONENT_NAMES[component] ?? component

const describeEngineError = (error: EngineErrorDto): string => {
  switch (error.type) {
    case "malformed-request":
      return `計算エンジンが入力を読めませんでした: ${error.detail}`
    case "invalid-value":
      return `値が正しくありません（${error.field}）。`
    case "unsupported-component":
      return `この計算エンジンが知らない種類の解析値があります（${error.field}）。アプリを更新してください。`
    case "unsupported-spec-version":
      return `この解析値は別の版の形式（v${error.version}）で書かれています。この計算エンジンが読めるのは v${error.known} です。アプリを更新してください。`
    case "no-setting-levels":
      return "設定がひとつもありません。"
    case "duplicate-setting-level":
      return error.at === undefined ? `${settingLevel(error.settingLevel)}が2回あります。` : `「${error.at}」に${settingLevel(error.settingLevel)}の値が2つあります。`
    case "missing-setting-level":
      return `「${error.at}」に${settingLevel(error.settingLevel)}の値がありません。`
    case "unknown-setting-level":
      return `「${error.at}」に、この機種にない${settingLevel(error.settingLevel)}の値があります。`
    case "duplicate-entity":
      return `「${error.entity}」が2つあります。`
    case "missing-component":
      return `「${error.entity}」に${componentName(error.component)}がありません。`
    case "conflicting-components":
      return `「${error.entity}」に${componentName(error.first)}と${componentName(error.second)}の両方があります。どちらかにしてください。`
    case "stray-component":
      return `${componentName(error.component)}が、ない「${error.entity}」に付いています。`
    case "part-of-non-bonus":
      return `「${error.entity}」は「${error.of}」の内訳になっていますが、「${error.of}」はボーナスではありません。`
    case "watch-of-non-bonus":
      return `「${error.entity}」は「${error.of}」の中で見る場面になっていますが、「${error.of}」はボーナスではありません。`
    case "cue-of-non-watch":
      return `「${error.entity}」は「${error.of}」の示唆になっていますが、「${error.of}」はボーナス中に見る場面ではありません。`
    case "cues-exceed-one":
      return `「${error.entity}」の${settingLevel(error.settingLevel)}の示唆を全部足すと ${(error.sum * 100).toFixed(2)}% になり、100% を超えています。`
    case "watch-partly-whole":
      return `「${error.entity}」の示唆は、足して 100% になる設定とならない設定があります。全部の設定で 100% にするか、全部の設定で 100% 未満にしてください。`
    case "invalid-probability":
      return `「${error.at}」の${settingLevel(error.settingLevel)}の確率が正しくありません。`
    case "probabilities-exceed-one":
      return `${settingLevel(error.settingLevel)}の確率を全部足すと ${(error.sum * 100).toFixed(2)}% になり、100% を超えています。`
    case "missing-payout":
      return `ボーナス「${error.at}」の獲得枚数がないため、機械割を計算できません。`
    case "missing-rate":
      return `${settingLevel(error.settingLevel)}の機械割がありません。`
    case "unknown-rate":
      return `この機種にない${settingLevel(error.settingLevel)}の機械割があります。`
    case "rate-not-from-spec":
      return "純増のないAT機の機械割は解析値から計算できません。設定ごとの機械割を入れてください。"
    case "at-not-alone":
      return `AT機には「${error.entity}」を入れられません。ボーナスや2つ目のAT・CZは入れず、AT・CZ・モード・小役・リプレイ・ベースだけにしてください。`
    case "missing-base":
      return "AT機にはベース（50枚あたりのゲーム数）が要ります。"
    case "base-without-at":
      return "ベースはAT機にだけ入れます。この機種にはATがありません。"
    case "first-hit-beyond-ceiling":
      return `「${error.at}」の${settingLevel(error.settingLevel)}の初当たりが、天井と同じか天井より重くなっています。`
    case "path-without-at":
      return "この機種にはATがないため、AT間・CZ間のゲーム数は使えません。"
    case "at-never-comes":
      return "この算出条件では、ATに当たらないまま終わる設定があるため、天井狙いの期待値を出せません。"
    case "played-mismatch":
      return "この機種の打ち方に合わない形で、打ったゲームが渡されました。"
    case "mode-without-at":
      return `モード「${error.entity}」はAT機にだけ入れられます。この機種にはATがありません。`
    case "ceiling-beside-modes":
      return `モードのあるAT機では、天井はモードごとに入れます。「${error.entity}」の天井は外してください。`
    case "allotment-not-whole":
      return `${settingLevel(error.settingLevel)}の${error.afterReset ? "リセット時の" : ""}モード振り分けの合計が ${(error.sum / 100).toFixed(2)}% です。100% にしてください。`
    case "reset-allotment-partial":
      return `モード「${error.entity}」にリセット時の振り分けがありません。全部のモードに入れるか、全部空にしてください。`
    case "cz-without-at":
      return `CZ「${error.entity}」はAT機にだけ入れられます。この機種にはATがありません。`
    case "first-hit-beside-cz":
      return `CZからATに入る機種では、ATの初当たりはCZ合算と成功率から計算します。「${error.entity}」の初当たりは外してください。`
    case "payout-beside-at":
      return `AT機の小役は、払い出しがベースに含まれるため枚数を入れません。「${error.entity}」の枚数は外してください。`
    case "reset-ceiling-beside-modes":
      return `モードのあるAT機では、設定変更後もAT後と同じモードに入るため、設定変更後のAT間天井は入れられません。「${error.entity}」のリセット後の天井は外してください。`
    case "at-ceiling-without-cz":
      return `モードのAT間天井は、CZからATに入る機種にだけ入れられます。CZのない機種では、モードの天井がそのままAT間天井です。「${error.entity}」のAT間天井は外してください。`
    case "empty-set":
      return `AT「${error.entity}」の1セットの枚数が0枚です。1枚以上にしてください。`
    case "empty-net-per-game":
      return `AT「${error.entity}」の純増が0枚です。0より大きくしてください。`
    case "other-net-beyond-whole":
      return `AT「${error.entity}」の別の純増で取る割合が合わせて${(error.sum / 100).toFixed(2).replace(/\.?0+$/, "")}%です。それぞれ0%より大きく、合わせて100%以下にしてください。`
    case "unattainable-rate":
      return `AT「${error.entity}」の${settingLevel(error.settingLevel)}の機械割は、この初当たり・ベース・純増のATでは出せません。機械割・ベース・純増を確かめてください。`
    case "endless-continuation":
      return `AT「${error.entity}」の${settingLevel(error.settingLevel)}の継続率が100%です。100%未満にしてください。`
    case "payout-table-not-whole":
      return `AT「${error.entity}」の${settingLevel(error.settingLevel)}の獲得枚数の表の合計が ${(error.sum / 100).toFixed(2)}% です。100% にしてください。`
    case "needs-cap":
      return `AT「${error.entity}」の${componentName(error.component)}は、有利区間の上限を入れたときだけ使えます。`
    case "cap-without-at":
      return "有利区間の上限はAT機にだけ入れます。この機種にはATがありません。"
    case "unknown-count":
      return `「${error.id}」はこの機種の解析値にありません。`
    case "overlapping-counts":
      return `「${error.id}」が重ねて数えられています。`
    case "counts-exceed-games":
      return "数えた回数がゲーム数を超えています。"
    case "cues-exceed-trials":
      return `「${error.id}」の示唆を、数えたボーナスで見られる回数より多く数えています。ボーナスも数えてください。`
    case "prior-mismatch":
      return `設定配分に、この機種にない${settingLevel(error.settingLevel)}があります。`
    case "invalid-prior":
      return `設定配分の合計が ${(error.sum / 100).toFixed(2)}% です。100% にしてください。`
    case "contradictory-evidence":
      return "数えた結果は、設定配分で残したどの設定でもありえません。入力を確かめてください。"
  }
}

export const describeEngineFailure = (failure: EngineFailure): string =>
  failure.type === "engine" ? describeEngineError(failure.error) : `計算エンジンを起動できませんでした: ${failure.detail}`

export const describePlayProblem = (problem: ObservationProblem | PriorProblem): string => {
  switch (problem.type) {
    case "counter-below-counting":
      return problem.id === undefined
        ? "データカウンターの総ゲーム数が、小役を数えたゲーム数より少なくなっています。読み直してください。"
        : `データカウンターの ${problem.id} の回数が、数えた回数より少なくなっています。読み直してください。`
    case "prior-rules-out-every-setting-level":
      return `設定配分「${priorName(problem.prior)}」は、この算出条件のどの設定にも割合がありません。別の設定配分を選んでください。`
  }
}
