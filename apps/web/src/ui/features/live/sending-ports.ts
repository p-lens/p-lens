import type { SendingPorts } from "../../../application/sending"
import type { Services } from "../../../application/services"

/** What sending a play reaches, out of what the app is made of. */
export const sendingPortsOf = (services: Services): SendingPorts => ({
  drafts: services.drafts,
  relay: services.sync.relay,
  sealer: services.sync.sealer,
  now: services.now,
  newId: () => crypto.randomUUID(),
})
