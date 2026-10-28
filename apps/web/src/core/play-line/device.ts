/**
 * The name a device goes by on its owner's plays' lines: made once on the
 * device and kept, never the one it writes to the shared catalog under, so
 * that nothing the catalog keeps ties a person's plays to it.
 */
export type DeviceId = string & { readonly __brand: "DeviceId" }
