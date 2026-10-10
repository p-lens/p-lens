/**
 * What a member may do with a book. There is no notion of one person being
 * over another: someone who can edit another person's book holds the editor
 * role on that book, and that is all. What a book is called is its
 * owner's to say: an editor writes to a book and does not rename it.
 */
export type Role = "owner" | "editor" | "viewer"

export type Capability = "read" | "write" | "rename" | "manage-members"

const GRANTS: Readonly<Record<Role, readonly Capability[]>> = {
  owner: ["read", "write", "rename", "manage-members"],
  editor: ["read", "write"],
  viewer: ["read"],
}

export const can = (role: Role, capability: Capability): boolean => GRANTS[role].includes(capability)
