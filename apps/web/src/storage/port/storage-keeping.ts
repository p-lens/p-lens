/**
 * Where what this device stores stands with its browser: kept until the
 * person clears it, open to being cleared when the browser is short of
 * room, or unknown where the browser cannot say.
 */
export type StorageKeeping = "kept" | "clearable" | "unknown"

/**
 * The browser's word on what this device stores. A browser clears a site's
 * storage on its own when it runs short — unless the site asked for it to
 * be kept and was granted that. The books live in that storage and nowhere
 * else until they are backed up or synced.
 */
export interface StorageKeeper {
  readonly standing: () => Promise<StorageKeeping>
  /** Ask for the storage to be kept. Some browsers grant or refuse on their own; some ask the person. */
  readonly ask: () => Promise<StorageKeeping>
}
