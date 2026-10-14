import type { SettingInference } from "../../../application/pachislot/setting-inference"

/** The press that reads a told play's setting level, as its button says it at rest. */
const SETTING_INFERENCE_PRESS = "設定をベイズ推定する"

/** What the press says, as the reading stands. */
export const settingInferenceButtonText = (inference: SettingInference): string => {
  switch (inference.type) {
    case "resting":
    case "failed":
      return SETTING_INFERENCE_PRESS
    case "inferring":
      return "推論中…"
    case "inferred":
      return "推論完了"
  }
}

/** That an AT machine's history read better with the CZs missed on the way to each AT counted. */
export const MISSES_SHARPEN = "CZスルー回数を入力すると、さらに精度が上がります。"

/** What a told play's setting level was read under: nothing was supposed of the cabinet beforehand. */
export const EVEN_PRIOR = "均等（事前の見込みなし）"
