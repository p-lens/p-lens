import { veil, type Secret } from "../../mummer"

/** A cabinet's number, sealed where it comes to the words: with a parlor's name, it says where a person sits. */
export type CabinetNumber = Secret<"cabinet", string>

/** What stands for a cabinet's number while it is veiled: one shape, whatever the number. */
const VEILED_NUMBER = "•••"

/** What stands for a cabinet's number where none was given. */
const NO_NUMBER = "----"

/** A cabinet's number alone. */
export const cabinetNumberText = (number: CabinetNumber): string => veil.text(number, (shown) => shown, VEILED_NUMBER)

/** A cabinet as a parlor calls it: `123番台`, dashes where no number was given. */
export const cabinetText = (number: CabinetNumber | undefined): string => `${number === undefined ? NO_NUMBER : cabinetNumberText(number)}番台`

const MASKED = "masked"

/** Whether a field a cabinet's number is typed into shows each character as a dot, as a password's are without being one: while the number is veiled. */
export const cabinetFieldMasked = (number: CabinetNumber): boolean => veil.text(number, () => "", MASKED) === MASKED
