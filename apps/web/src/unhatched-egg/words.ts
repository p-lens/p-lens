/** What the egg says, kept with it: nothing of it is anywhere else. On screen it is 新機能実験モード, said plainly. */
export const stillToGo = (left: number, open: boolean): string => (open ? `あと${left}回で実験モードを終了します` : `あと${left}回で実験モードに突入します`)

export const turnedOver = (open: boolean): string => (open ? "実験モードに移行しました" : "実験モードを終了しました")
