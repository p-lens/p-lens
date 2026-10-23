import { readSavingsAccount, savingsRoot } from "../../core/journal/accounts"
import { seal } from "../../mummer"
import { parlorNameText } from "./parlor"

/** An account as a screen shows it: a parlor's savings with the parlor's name as 配信モード says, every other as it is written. */
export const accountText = (account: string): string =>
  ((savings) => (savings === undefined ? account : `${savingsRoot(savings.kind)}:${parlorNameText(seal.parlor(savings.parlorName))}:${savings.tier}`))(readSavingsAccount(account))
