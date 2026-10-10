import { type Connection, DEVICE, completionOf, resultOf } from "../../storage/browser/database"

interface DeviceRecord {
  readonly key: "device"
  readonly id: string
}

const storedId = async (database: IDBDatabase): Promise<string | undefined> => {
  const stored = await resultOf<DeviceRecord>(database.transaction(DEVICE).objectStore(DEVICE).get("device"))
  return stored.ok ? stored.value?.id : undefined
}

/**
 * This device's id, the name it writes to the shared catalog under: made the
 * first time it is asked for and kept from then on. Two first asks at once
 * keep whichever was stored first. A device that cannot keep one names itself
 * afresh each time.
 */
export const createIndexedDbDevice =
  (database: Connection, newId: () => string): (() => Promise<string>) =>
  async () => {
    const db = await database()
    if (!db.ok) return newId()
    const stored = await storedId(db.value)
    if (stored !== undefined) return stored
    const made: DeviceRecord = { key: "device", id: newId() }
    const transaction = db.value.transaction(DEVICE, "readwrite")
    transaction.objectStore(DEVICE).add(made)
    await completionOf(transaction)
    return (await storedId(db.value)) ?? made.id
  }
