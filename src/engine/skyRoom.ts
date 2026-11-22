// Public sky room check: a sky lobby opened to the public (research P06-M07 public uses at height,
// P11-M02 public access and security separation, P11-M07 barrier-free access). Early check, not a policy ruling.
import { DEFAULT_EGRESS_PRESETS, postedLimitForRoom, skyRoomLoads, type EgressPresets, type EgressResult } from './egress'
import { DEFAULT_LIFT_PRESETS, autoCoreShare, publicStopFloors, skyRoomVisitors5, type LiftPresets, type LiftResult, type PublicStopFloor, type Rise } from './lifts'
import { coreAreaAt, towerFloors } from './massing'
import type { CommunityBenefit, Floor, RuleResult, RuleState, Tower } from './types'

/** The wind on the deck at the sky room's level, worded by Wind on terraces and roofs (lib/swRun.ts, research R5 §1). */
export interface SkyTerraceLine { value: string; threshold: string; state: RuleState; note: string; source: string }

export interface SkyRoomResult {
  room: Floor | null
  /** Visitor capacity used: the posted limit if set, else the Table 3.1.17.1 load. */
  capacity: number
  /** Table 3.1.17.1 load of the visitor area. */
  tableLoad: number
  /** Largest posted limit at which the room no longer widens the exit stairs, and the stair width it then needs. */
  suggestedLimit: { limit: number; widthMm: number } | null
  visitorArea: number
  visitorsPerHour: number
  peak5: number
  /** Lift group that carries the visitors from grade. */
  group: Rise | null
  /** Further public levels on the room's public lifts (`Tower.publicStops`, G43); empty without them. */
  publicStops: PublicStopFloor[]
  /** Visitor area of the room and its further public levels, as a share of the gross floor area above the podium (%). */
  shareAbovePodium: number
  rules: RuleResult[]
}

const fmt = (v: number) => Math.round(v).toLocaleString()
// P1 #2 (21 Nov): the 1997 platform text ("a public deck … where possible") is superseded. The 2026 Higher Buildings
// Policy has no deck clause; a public room is one of its 2.1(g) community benefits (pp.3–4, book notes hbp-dobson-report.md).
const HBP_2026 = { label: 'City of Vancouver, Higher Buildings Policy (rev. 31 Mar 2026), 2.1(f) and 2.1(g)', page: 'pp.3–4', url: 'https://guidelines.vancouver.ca/policy-higher-buildings-for-rezonings.pdf' }
/** Public engagement on Vancouver towers: a visible, publicly accessible give-back ranks above private amenity. */
const DOBSON = { label: 'Dobson, vertical studio (engagement themes, rank 3: a visible, publicly accessible give-back; book notes dobson-vertical-studio.md)', page: 'p.91' }
/** The 2.1(g) benefits in words. */
export const BENEFIT_LABEL: Record<CommunityBenefit, string> = {
  cultural: 'significant cultural facility',
  social: 'significant social facility',
  heritage: 'heritage retention',
  housing: 'low-cost housing',
  transfer: 'recipient site for a density transfer',
}
export const HERITAGE_LABEL: Record<'none' | 'retained' | 'demolished', string> = { none: 'no Class A heritage building on the site', retained: 'a Class A heritage building on the site, retained', demolished: 'a Class A heritage building demolished' }
const STOPES = { label: 'Stopes, Designing a Vertical Transportation Strategy in the Largest and Tallest Building in the City of London (22 Bishopsgate)', url: 'https://liftescalatorlibrary.org/paper_indexing/papers/00000193.pdf' }
const VBBL_ACCESS = { label: 'Vancouver Building By-law 2019, Section 3.8 Accessibility (VBBL 2025 unread)', url: 'https://free.bcpublications.ca/civix/document/id/public/vbbl2019/369101801' }

/**
 * Posted visitor limit at which the sky room stops widening the exit stairs, solved with the core: posting a limit
 * can shrink an auto-sized core, which leaves more floor around the room (and on the other floors) and moves the
 * limit, so the limit is re-solved at the core it produces until it settles; if it keeps moving, the smaller of the
 * last two values is kept.
 */
export function stablePostedLimit(t: Tower, liftP: LiftPresets = DEFAULT_LIFT_PRESETS, e: EgressPresets = DEFAULT_EGRESS_PRESETS): { limit: number; widthMm: number } | null {
  if (!t.skyRoom) return null
  const li = { homeM2: liftP.homeM2, hotelM2PerKey: liftP.hotelM2PerKey }
  const at = (limit: number | null): { limit: number; widthMm: number } | null => {
    const trial: Tower = { ...t, skyRoom: { ...t.skyRoom!, postedLimit: limit } }
    return postedLimitForRoom(t.coreAuto ? { ...trial, coreShare: autoCoreShare(trial, liftP, e) } : trial, e, li)
  }
  let cur = postedLimitForRoom(t, e, li)
  if (!cur || !t.coreAuto) return cur
  for (let k = 0; k < 8; k++) {
    const next = at(cur.limit)
    if (!next) return cur
    if (Math.abs(next.limit - cur.limit) <= 1) return next.limit <= cur.limit ? next : cur
    if (k === 7) return next.limit < cur.limit ? next : cur
    cur = next
  }
  return cur
}

/**
 * Higher Buildings Policy 2.1(g) community benefit and 2.1(f) Class A heritage, as the team declares them (P1 #2): the
 * benefit line names the declared type and what delivers it in the model (the public room, its further public stops,
 * civic floors); pass when declared, open otherwise. Heritage: pass when declared none or retained, fail when declared
 * demolished, open otherwise. Declarations only: whether the City accepts a benefit is a rezoning negotiation.
 */
export function benefitLines(t: Tower, room: Floor | null, stops: PublicStopFloor[]): RuleResult[] {
  const civic = towerFloors(t).filter((f) => f.use === 'civic').map((f) => f.level)
  const runs = (lv: number[]) => {
    const out: string[] = []
    for (let i = 0; i < lv.length; i++) { let j = i; while (j + 1 < lv.length && lv[j + 1] === lv[j] + 1) j++; out.push(j > i ? `L${lv[i]}–L${lv[j]}` : `L${lv[i]}`); i = j }
    return out.join(', ')
  }
  const parts = [
    room ? `public room L${room.level}` : '',
    stops.length ? `public stops ${stops.map((x) => `L${x.floor.level}`).join(', ')}` : '',
    civic.length ? `civic floor${civic.length > 1 ? 's' : ''} ${runs(civic)}` : '',
  ].filter(Boolean)
  const b = t.communityBenefit ?? null
  const h = t.heritageA ?? null
  return [
    {
      id: `skyroom-benefit-${t.id}`,
      label: 'Community benefit (HBP 2.1(g))',
      value: b ? `2.1(g): community benefit — ${BENEFIT_LABEL[b]}${parts.length ? `, ${parts.join(' + ')}` : ''}` : `Not declared${parts.length ? `; in the model: ${parts.join(' + ')}` : ''}`,
      threshold: 'one of: a recipient site for a density transfer, heritage retention, a significant cultural or social facility, or low-cost housing (2.1(g))',
      state: b ? 'pass' : 'unknown',
      flag: 'verified',
      source: HBP_2026,
      note: b
        ? `Declared by the team (communityBenefit). ${(b === 'cultural' || b === 'social') && !parts.length ? 'Nothing in the model delivers it yet: open a sky lobby to the public, add public stops or civic floors. ' : ''}Whether the City accepts it, and how it is secured, is settled at rezoning; the policy sets no size.`
        : 'Declare the benefit the tower offers (communityBenefit, Schematic › Sky lobbies). A public room, public stops and civic floors on the public route are candidates for a cultural or social facility.',
    },
    {
      id: `skyroom-heritage-${t.id}`,
      label: 'Class A heritage (HBP 2.1(f))',
      value: h ? HERITAGE_LABEL[h] : 'Not declared',
      threshold: 'no demolition of a Class A heritage building (2.1(f))',
      state: h === 'demolished' ? 'fail' : h ? 'pass' : 'unknown',
      flag: 'verified',
      source: HBP_2026,
      note: 'A declaration (heritageA): the Toolkit has no heritage register layer. On the competition block, a hypothetical site, declare none unless the brief places a heritage building on it; on Real Vancouver, check the Vancouver Heritage Register for the lots.',
    },
  ]
}

export function skyRoomCheck(t: Tower, lift: LiftResult, egress: EgressResult, e: EgressPresets = DEFAULT_EGRESS_PRESETS, liftP: LiftPresets = DEFAULT_LIFT_PRESETS, terrace?: SkyTerraceLine | null): SkyRoomResult {
  const floors = towerFloors(t)
  const room = t.skyRoom ? floors.find((f) => f.skyLobby && f.level === t.skyRoom!.level) ?? null : null
  if (!room || !t.skyRoom) {
    return {
      room: null, capacity: 0, tableLoad: 0, suggestedLimit: null, visitorArea: 0, visitorsPerHour: 0, peak5: 0, group: null, publicStops: [], shareAbovePodium: 0,
      rules: [{
        id: `skyroom-none-${t.id}`,
        label: 'Public amenity at height',
        value: t.skyLobbies?.length ? 'Sky lobby is tenant-only' : 'No sky lobby or public room',
        threshold: 'a visible, publicly accessible give-back rather than private amenity (public engagement)',
        state: 'warn',
        flag: 'unverified',
        source: DOBSON,
        note: 'The 2026 Higher Buildings Policy asks for no deck; it asks for a community benefit under 2.1(g) (see that line). People asked in engagement ranked a visible public give-back high. Make a sky lobby public in Design, Schematic.',
      }, ...benefitLines(t, null, [])],
    }
  }
  const r = t.skyRoom
  // The room's own floor less the core at its level: a core that steps in below the room leaves it more floor (G45).
  const net = Math.max(0, room.area - coreAreaAt(t, room.level))
  const visitorArea = net * r.visitorShare
  const loads = skyRoomLoads(t, net)
  const capacity = loads.visitors
  const suggestedLimit = stablePostedLimit(t, liftP, e)
  const posted = r.postedLimit != null && loads.visitors < loads.table
  const visitorsPerHour = capacity * (60 / Math.max(10, r.visitMinutes))
  const peak5 = skyRoomVisitors5(t, room)
  const group = lift.rises.find((g) => g.cls === 'public' && g.floors.some((f) => f.level === room.level)) ?? lift.rises.find((g) => g.kind === 'shuttle' && g.floors[0].level === room.level) ?? null
  const abovePodium = floors.filter((f) => !f.podium).reduce((s, f) => s + f.area, 0)
  // Further public levels on the room's public lifts (G43): each storey less the core at its level, times its share.
  const stops = publicStopFloors(t, floors)
  const stopsArea = stops.reduce((s, x) => s + x.visitorArea, 0)
  const shareAbovePodium = abovePodium > 0 ? ((visitorArea + stopsArea) / abovePodium) * 100 : 0
  const stopsWord = stops.map((x) => `L${x.floor.level}${x.stop.label ? ` ${x.stop.label}` : ''} ${fmt(x.visitorArea)} m²`).join(', ')
  const storey = egress.storeys.find((s) => s.level === room.level)

  const rules: RuleResult[] = [
    {
      id: `skyroom-amenity-${t.id}`,
      label: 'Public amenity at height',
      value: `Public sky room at level ${room.level}, +${Math.round(room.z0)} m, about ${fmt(visitorArea)} m² open to visitors${stops.length ? `; its public lifts also stop at ${stopsWord}` : ''}`,
      threshold: 'a visible, publicly accessible give-back rather than private amenity (public engagement)',
      state: 'pass',
      flag: 'unverified',
      source: DOBSON,
      note: 'Its policy basis is now the 2.1(g) community benefit line (HBP 2026); no text sets a size. City staff found a hotel lobby plus roof garden an inadequate public amenity (2002, under the 1997 policy); the Bay Parkade rezoning (2026) secured free resident access to its observation deck (news report, research P01).',
    },
    ...benefitLines(t, room, stops),
    {
      id: `skyroom-share-${t.id}`,
      label: 'Public floor area above the podium',
      value: `${shareAbovePodium.toFixed(1)}% of tower floor area${stops.length ? ` (sky room L${room.level} ${fmt(visitorArea)} m², ${stopsWord})` : ''}`,
      threshold: '≥ 5% good, < 1% weak (team preset)',
      state: shareAbovePodium >= 5 ? 'pass' : shareAbovePodium >= 1 ? 'warn' : 'fail',
      flag: 'team_assumption',
      source: { label: 'Team preset in research P06-M07; the Higher Buildings Policy (2026) and the VTC brief give no number' },
      note: stops.length
        ? 'Counts the sky room and the further public levels its public lifts stop at (publicStops): each storey less the core at its level, times its visitor share. Outdoor terraces are not counted.'
        : 'One floor of a 60-plus-storey tower is about 1.5%: a second public level, an outdoor terrace or a larger visitor share raises it.',
    },
    {
      id: `skyroom-access-${t.id}`,
      label: 'Free entry and opening hours',
      value: `${r.free ? 'Free' : 'Ticketed'}, ${r.hoursOpen} hours a day`,
      threshold: 'Free, open about 10:00–22:00 every day (team preset)',
      state: r.free && r.hoursOpen >= 12 ? 'pass' : !r.free || r.hoursOpen < 9 ? 'fail' : 'warn',
      flag: 'team_assumption',
      source: { label: 'Team preset in research P06-M07: Sky Garden London is free with booking (precedent); Vancouver Lookout is ticketed (City memo, Apr 2026)' },
    },
    {
      id: `skyroom-lifts-${t.id}`,
      label: 'Visitor lifts from grade',
      value: group ? `${group.id}: ${group.cars} cars at ${group.speed} m/s for about ${fmt(stops.length ? group.visitors5 ?? peak5 : peak5)} visitors per peak 5 min${stops.length ? ` (the room and ${stops.map((x) => `L${x.floor.level}`).join(', ')})` : ''}` : 'No lift group reaches the room',
      threshold: 'carry the peak visitors with an interval ≤ 40 s (team)',
      state: group ? group.state : 'fail',
      flag: 'team_assumption',
      source: { label: `Team assumptions: capacity ${fmt(capacity)} people (${posted ? 'posted limit' : `${r.loadBasis}, ${Math.round(r.visitorShare * 100)}% of the floor`}), visits of ${r.visitMinutes} min, peak 5 min = 1.5 × the hourly average` },
      note: `About ${fmt(visitorsPerHour)} visitors an hour at capacity. ${r.access === 'shared' ? 'Visitors ride the tenants\' shuttle, which is sized for both.' : 'Visitors have their own lifts from grade.'}`,
    },
    {
      id: `skyroom-security-${t.id}`,
      label: 'Visitors kept apart from tenants',
      value: r.access === 'dedicated' ? 'Own lifts and street entrance' : 'Shared shuttle and transfer lobby',
      threshold: 'Public visitors separated from tenant lifts',
      state: r.access === 'dedicated' ? 'pass' : 'warn',
      flag: 'team_assumption',
      source: STOPES,
      note: r.access === 'dedicated'
        ? 'Separate lifts protect tenant lifts and lobbies but add shafts from grade (see the core & lift check).'
        : 'Visitors arrive in the tenants\' transfer lobby: the sky lobby needs a controlled line to the tenant rises. Stair doors cannot simply lock against re-entry (VBBL 3.4.6.18: an unlocked door within 2 storeys).',
    },
    {
      id: `skyroom-stepfree-${t.id}`,
      label: 'Step-free access with a spare lift',
      value: group ? `${group.cars} accessible car${group.cars > 1 ? 's' : ''} from the street` : 'None',
      threshold: 'a barrier-free route (3.8), and at least 2 cars so one out of service does not strand wheelchair users (team)',
      state: group && group.cars >= 2 ? 'pass' : 'fail',
      flag: 'team_assumption',
      source: VBBL_ACCESS,
      note: 'Barrier-free route and accessible lifts (3.8.3.7, CSA B44 Appendix E) are by-law; two cars is the team\'s redundancy rule. Add a universal washroom on the sky room floor (good practice; 3.8.2.8 asks for one on the entrance storey).',
    },
  ]
  if (storey) {
    // The room widens the stairs only if it is the busiest tower storey.
    const drives = storey.needMm > 1101 && egress.governing?.level === room.level
    rules.push({
      id: `skyroom-exits-${t.id}`,
      label: 'Exit stairs from the sky room',
      value: `${fmt(storey.load)} people → ${fmt(storey.needMm)} mm per stair`,
      threshold: `${egress.stairs} stairs at ≥ 8 mm per person, ≥ 1100 mm`,
      state: drives ? 'warn' : 'pass',
      flag: 'verified',
      source: { label: 'Vancouver Building By-law 2019, 3.4.3.2 and Table 3.1.17.1 (VBBL 2025 unread)', url: 'https://free.bcpublications.ca/civix/document/id/public/vbbl2019/463712062' },
      note: drives
        ? `At this occupant load the room sets the stair width from level ${room.level} to the ground (see the egress check). ${suggestedLimit && suggestedLimit.limit > 0 ? `A posted limit of ${fmt(suggestedLimit.limit)} visitors stops the room widening the stairs (they then need ${fmt(suggestedLimit.widthMm)} mm for the other floors)` : 'Even an empty room leaves the rest of its floor busier than the other floors; give the room a larger share of the floor or move the lift lobby'}; a further stair would bring each to about ${fmt(Math.max(1100, (storey.load * 8) / (egress.stairs + 1)))} mm.${r.loadBasis === 'standing' ? ' Tables instead of standing room cut the load to a third.' : ''}`
        : storey.needMm > 1101 ? `The room needs ${fmt(storey.needMm)} mm, no more than another floor already sets (${fmt(egress.widthMm)} mm), so it does not widen the stairs.` : 'The room does not widen the stairs beyond the 1100 mm minimum.',
    })
  }
  if (r.postedLimit != null) {
    rules.push({
      id: `skyroom-posted-${t.id}`,
      label: 'Posted occupant limit',
      value: posted ? `${fmt(capacity)} visitors posted (the table load would be ${fmt(loads.table)})` : `${fmt(r.postedLimit)} posted, above the table load of ${fmt(loads.table)}, so the table load governs`,
      threshold: 'Below the Table 3.1.17.1 load only where it can be shown the room will hold fewer people',
      state: posted ? 'warn' : 'pass',
      flag: 'unverified',
      source: { label: 'Vancouver Building By-law 2019, 3.1.17.1 (the sentence allowing a lower load was not read in our research)', url: 'https://free.bcpublications.ca/civix/document/id/public/vbbl2019/519280133' },
      note: 'A posted limit needs a sign in the room, managed entry (timed tickets or a counter) and acceptance by the Chief Building Official; a code consultant confirms the route.',
    })
  }
  // The terrace at the room's level, read from the storey outlines by Wind on terraces and roofs when it has run.
  rules.push(terrace
    ? { id: `skyroom-wind-${t.id}`, label: 'Wind on an outdoor terrace', value: terrace.value, threshold: terrace.threshold, state: terrace.state, flag: 'team_assumption', source: { label: terrace.source }, note: terrace.note }
    : {
      id: `skyroom-wind-${t.id}`,
      label: 'Wind on an outdoor terrace',
      value: 'Not assessed',
      threshold: 'Comfort criteria for a terrace at height',
      state: 'unknown',
      flag: 'unresolved',
      source: { label: 'Research P03-M08 (elevated public terrace and sky-lobby wind check, roadmap); research R5 §1' },
      note: 'Needed only if the room opens onto a terrace. Switch on Wind on terraces and roofs (Sun & Wind) to read it from the storey outlines.',
    })
  return { room, capacity, tableLoad: loads.table, suggestedLimit, visitorArea, visitorsPerHour, peak5, group, publicStops: stops, shareAbovePodium, rules }
}
