// A reserved node namespace governed by Nations (product #3, 21 Nov: "anyone can add nodes"). It is empty and stays
// empty until a Nation chooses otherwise. The rule, here in code and in the node-builder skill (SKILL.md, step 4):
// - only an author verified by a Nation can publish a node under `nation.*`; the registry and the node builder refuse
//   any other id there;
// - the verifying Nation and its authors decide: a node may be kept private or withheld, and the registry then does
//   not list it;
// - no one else publishes, forks, copies or renames a node into `nation.*`, and this toolkit writes nothing there.
// No Nation has used it and no engagement has happened. This file holds no cultural content and no workflow.
export const NATION_PREFIX = 'nation.'

/** The verified-author field (`author.nationVerified` on a registry module): which Nation verified the author, who for the Nation, and when. */
export interface NationVerification { nation: string; verifiedBy: string; date: string }

export interface ReservedNamespace {
  prefix: string
  name: string
  /** Plain status, shown wherever the namespace is named. */
  label: string
  rules: string[]
  /** Node ids published here: none. */
  nodes: readonly string[]
}

export const NATION_NAMESPACE: ReservedNamespace = {
  prefix: NATION_PREFIX,
  name: 'Nation-governed nodes (nation.*)',
  label: 'Reserved for nodes published by authors verified by a Nation, such as the Musqueam, Squamish or Tsleil-Waututh Nation. No Nation has used it, and no engagement has happened: it is an empty space kept open, not a partnership.',
  rules: [
    'Only an author verified by a Nation can publish a node under nation.*; any other id there is refused.',
    'The Nation and its authors decide: a node may be kept private or withheld, and the registry then does not list it.',
    'No one else may publish, fork, copy or rename a node into nation.*, and this toolkit writes nothing there.',
  ],
  nodes: [],
}

export const NATION_REFUSAL = 'nation.* is reserved for nodes published by authors verified by a Nation. No Nation has used it. Use community.<your-handle>.<node-name> instead.'

export const isNationId = (id: string) => id.startsWith(NATION_PREFIX)

const filled = (v: unknown) => typeof v === 'string' && v.trim().length > 0

/** Is this a verified-author field: a Nation, who verified for it, and a date? */
export function isNationVerified(v: unknown): v is NationVerification {
  const x = v as Partial<NationVerification> | null | undefined
  return !!x && typeof x === 'object' && filled(x.nation) && filled(x.verifiedBy) && filled(x.date)
}

/** The guard: an id under nation.* is refused unless its author carries the verified-author field. Other ids pass here. */
export function namespaceGuard(id: string, author?: { nationVerified?: unknown } | null): { ok: true } | { ok: false; reason: string } {
  if (!isNationId(id)) return { ok: true }
  return isNationVerified(author?.nationVerified) ? { ok: true } : { ok: false, reason: NATION_REFUSAL }
}
