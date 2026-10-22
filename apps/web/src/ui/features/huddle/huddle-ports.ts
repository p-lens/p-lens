import type { HuddlePorts } from "../../../application/huddle"
import type { Services } from "../../../application/services"

/** What a huddle reaches, out of what the app is made of. */
export const huddlePortsOf = (services: Services): HuddlePorts => ({
  relay: services.sync.relay,
  sealer: services.sync.sealer,
  packer: services.packer,
  preferences: services.preferences,
  relayUrl: services.relayUrl,
  now: services.now,
  newId: () => crypto.randomUUID(),
})
