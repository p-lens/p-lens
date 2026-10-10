import { EMPTY_PARLOR_LIST } from "../../core/parlor/shared"
import { Ok } from "../../core/result/result"
import type { ParlorDirectory } from "../port/parlor-directory"

/**
 * The parlor directory of a P-Lens built with no parlor list — one set up by
 * someone for themselves. There are no parlors to choose; every play is
 * recorded without one, by its result.
 */
export const createAbsentDirectory = (): ParlorDirectory => ({ list: async () => Ok(EMPTY_PARLOR_LIST) })
