import type { StorageKeeper, StorageKeeping } from "../port/storage-keeping"

const keepingOf = (kept: boolean): StorageKeeping => (kept ? "kept" : "clearable")

const unknown = (): StorageKeeping => "unknown"

/** The browser's storage manager asked through `navigator.storage`; a browser without one, or one that fails to answer, leaves it unknown. */
export const createBrowserStorageKeeper = (): StorageKeeper => ({
  standing: () => (navigator.storage?.persisted === undefined ? Promise.resolve(unknown()) : navigator.storage.persisted().then(keepingOf, unknown)),
  ask: () => (navigator.storage?.persist === undefined ? Promise.resolve(unknown()) : navigator.storage.persist().then(keepingOf, unknown)),
})
