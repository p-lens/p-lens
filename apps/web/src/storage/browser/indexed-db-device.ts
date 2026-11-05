import { type Connection, DEVICE, completionOf, resultOf } from "./database"

/**
 * What a device's id is for: the name it writes to the shared catalog
 * under. An id for another use is one of its own, never this one, so that
 * nothing sent to the catalog ties anything else to it.
 */
type DeviceIdUse = "catalog"

/** The key each id is kept under. */
const KEPT_UNDER: Readonly<Record<DeviceIdUse, string>> = { catalog: "device" }

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
