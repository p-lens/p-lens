import { GENERAL } from "../general/csv-import"
import { GENERAL_NAME } from "../general/wording"
import { MANEKURU } from "../manekuru/csv-import"
import { MANEKURU_NAME } from "../manekuru/wording"
import { MAXBET } from "../maxbet/tags"
import { MAXBET_NAME } from "../maxbet/wording"
import { MYPACHI } from "../mypachi/csv-import"
import { MYPACHI_NAME } from "../mypachi/wording"
import { PACHIBO } from "../pachibo/pcb-import"
import { PACHIBO_NAME } from "../pachibo/wording"
import { PACHIFOLIO } from "../pachifolio/csv-import"
import { PACHIFOLIO_NAME } from "../pachifolio/wording"
import { PRECORD } from "../precord/csv-import"
import { PRECORD_NAME } from "../precord/wording"

const NAMES: Readonly<Record<string, string>> = { [GENERAL]: GENERAL_NAME, [PRECORD]: PRECORD_NAME, [PACHIBO]: PACHIBO_NAME, [MAXBET]: MAXBET_NAME, [MYPACHI]: MYPACHI_NAME, [MANEKURU]: MANEKURU_NAME, [PACHIFOLIO]: PACHIFOLIO_NAME }

/** What an app tallies were taken in from is called; one this app does not know goes by its own word. */
export const sourceName = (from: string): string => NAMES[from] ?? from
