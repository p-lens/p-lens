import type { ParlorList } from "../core/parlor/shared"
import type { ParlorDirectory } from "../parlors/port/parlor-directory"
import type { Outcome } from "./errors"
import { fromDirectory } from "./lift"

export const listSharedParlors = async (directory: ParlorDirectory): Promise<Outcome<ParlorList>> => fromDirectory(await directory.list())
