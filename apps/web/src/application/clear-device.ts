import type { DeviceData } from "../storage/port/device-data"
import type { Outcome } from "./errors"
import { fromStorage } from "./lift"

/**
 * Empty this device of everything the app keeps on it. It is the device's
 * copy that goes: a backup made of a book, wherever it was saved, and a
 * book on any other device stay as they are. Nothing here asks first;
 * whoever calls has — and opens the app afresh afterwards, since what is
 * running still holds what was read before.
 */
export const clearDevice = async (data: DeviceData): Promise<Outcome<void>> => fromStorage(await data.clear())
