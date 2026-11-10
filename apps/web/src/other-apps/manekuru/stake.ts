import type { PlayGameKind } from "../../core/play/play"

/**
 * The game a 投資種類 says, where it says one: a person's own word in
 * マネクルSP for what they put money into, `スロット`, `4パチ`, `20スロ`. スロ
 * is looked for before パチ, パチスロ being a pachislot; a word saying
 * neither says no game.
 */
export const gameKindOfStake = (stake: string): PlayGameKind | undefined => (/スロ|ｽﾛ/.test(stake) ? "pachislot" : /パチ|ﾊﾟﾁ|ぱち/.test(stake) ? "pachinko" : undefined)
