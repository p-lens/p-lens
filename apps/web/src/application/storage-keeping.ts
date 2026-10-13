import type { StorageKeeper, StorageKeeping } from "../storage/port/storage-keeping"

/**
 * Have the browser keep what this device stores, asking only where it is
 * not kept already: a browser that puts the question to the person is not
 * made to put it twice.
 */
export const keepStorage = async (keeper: StorageKeeper): Promise<StorageKeeping> => {
  const standing = await keeper.standing()
  return standing === "clearable" ? keeper.ask() : standing
}
