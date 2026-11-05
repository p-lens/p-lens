import type { Services } from "../../application/services"
import { createCrossing, type CrossingServices } from "../../crossing"
import { freshUuidV7 } from "./ids"

/**
 * The relay what crosses devices goes by, named at build time as a
 * `wss://` address (or `ws://`, for a relay run on this machine). A build
 * that names none makes nothing that crosses devices, and the app plays alone.
 */
const RELAY_URL: string | undefined = import.meta.env.VITE_RELAY_URL

const isRelayAddress = (url: string | undefined): url is string => url !== undefined && /^wss?:\/\/\S+$/.test(url)

/** What crosses devices, made where the build names a relay, out of what the app keeps: a book joined from another device belongs here to whoever uses this one, as a book put back from a backup does. */
export const crossingOf = (services: Services): CrossingServices | undefined =>
  isRelayAddress(RELAY_URL) ? createCrossing(RELAY_URL.replace(/\/+$/, ""), { preferences: services.preferences, session: services.session, drafts: services.drafts, me: services.backup.me, businessDay: services.businessDay, newId: freshUuidV7 }) : undefined
