import { type Connection, DEVICE, completionOf, resultOf } from "./database"

/**
 * What a device's id is for: the name it writes to the shared catalog
 * under, or the name it goes by on its own plays' lines. Two ids, never
 * one, so that nothing sent to the catalog ties a person's plays to it.
 */
type DeviceIdUse = "catalog" | "play-line"

/** The key each id is kept under: the catalog's is the one it was kept under before the play line had one. */
const KEPT_UNDER: Readonly<Record<DeviceIdUse, string>> = { catalog: "device", "play-line": "play-line" }

interface DeviceRecord {
  readonly key: string
  readonly id: string
}

const storedId = async (database: IDBDatabase, key: string): Promise<string | undefined> => {
  const stored = await resultOf<DeviceRecord>(database.transaction(DEVICE).objectStore(DEVICE).get(key))
  return stored.ok ? stored.value?.id : undefined
}

/**
 * This device's id for one use: made the first time it is asked for and
 * kept from then on. Two first asks at once keep whichever was stored
 * first. A device that cannot keep one names itself afresh each time.
 */
export const createIndexedDbDevice =
  (database: Connection, use: DeviceIdUse, newId: () => string): (() => Promise<string>) =>
  async () => {
    const db = await database()
    if (!db.ok) return newId()
    const key = KEPT_UNDER[use]
    const stored = await storedId(db.value, key)
    if (stored !== undefined) return stored
    const made: DeviceRecord = { key, id: newId() }
    const transaction = db.value.transaction(DEVICE, "readwrite")
    transaction.objectStore(DEVICE).add(made)
    await completionOf(transaction)
    return (await storedId(db.value, key)) ?? made.id
  }
