// Height limits of downtown Vancouver, for the Your site tab (17 Nov 2026, Sinnie: "research into height limit of
// downtown buildings, and include this information in the site properties details"). Three layers set what a tower may
// reach downtown: the Downtown Official Development Plan's zoning heights by sub-area, the General Policy for Higher
// Buildings (a rezoning path above them, under review in 2026), and the protected public views (the view cones, read
// by the toolkit's own Height limits tool). Figures and dates are as read on 17 Nov 2026 from the sources named on
// each row; the City's by-law PDFs refused automated readers, so the DODP numbers come from Council reports and the
// City's own project pages (unverified) and the Higher Buildings figures from the City's November 2013 policy text
// (the current text, amended 31 March 2026, was not opened). Check against the by-law before quoting.
import type { Flag } from '../engine/types'

export interface HeightFact {
  id: string
  /** The layer: zoning (DODP), the Higher Buildings Policy, public views, built context. */
  layer: 'zoning' | 'policy' | 'views' | 'built'
  label: string
  /** The figure as a person reads it: "137.2 m (450 ft)". */
  value: string
  /** One line more. */
  note: string
  source: { label: string; url: string; read: string }
  flag: Flag
}

export const DOWNTOWN_HEIGHTS: HeightFact[] = [
  { id: 'dodp-cbd', layer: 'zoning', label: 'Zoning · Central Business District (DODP area A)', value: '137.2 m (450 ft)',
    note: 'The Downtown Official Development Plan sets a basic and an increased maximum height for each numbered area on its Map 3 (Table 1); the increased heights go up to 137.2 m at the Development Permit Board\'s discretion, with 11 FSR in area A.',
    source: { label: 'City of Vancouver, Bentall Centre referral report (June 2026) and DODP Table 1', url: 'https://bylaws.vancouver.ca/odp/odp-downtown.pdf', read: 'Council report figures; the by-law PDF was not opened' }, flag: 'unverified' },
  { id: 'dodp-500', layer: 'zoning', label: 'Zoning · some sub-areas under view corridors', value: 'up to 152.4 m (500 ft)',
    note: 'A July 2026 Council report notes a sub-area where the Plan anticipates heights up to 152.4 m, subject to the Council-approved view corridors.',
    source: { label: 'City of Vancouver Council report, 28 July 2026', url: 'https://council.vancouver.ca/20260728/documents/r23.pdf', read: 'search excerpt; the PDF was not opened' }, flag: 'unverified' },
  { id: 'dodp-south', layer: 'zoning', label: 'Zoning · Downtown South', value: '91.4 m (300 ft)',
    note: 'Set by the 1991 amendment; the 1997 Skyline Study lists downtown limits of 450, 300, 150 and 90 ft by area, and the edges of the Plan carry basic heights of 21.3 to 32 m.',
    source: { label: 'Council report, Improvements to clarity of height limits in the Downtown (2010)', url: 'https://council.vancouver.ca/20100520/docs/p5_000.pdf', read: 'search excerpt; the PDF was not opened' }, flag: 'unverified' },
  { id: 'hbp-cbd', layer: 'policy', label: 'Higher Buildings Policy · the tallest, CBD', value: '~168–213 m (550–700 ft)',
    note: 'A rezoning path above zoning: the tallest buildings belong in the Central Business District, and ~700 ft only on Georgia, Burrard or Granville. Each must set a new benchmark for architecture, lead on energy (40–50% below 2010), bring public benefits, keep Class A heritage, and limit shadow and view impacts; 550 ft and up gets an enhanced panel with two international experts.',
    source: { label: 'City of Vancouver, General Policy for Higher Buildings (adopted 6 May 1997; amended 2011, 2013, 2014, 2018, 31 Mar 2026)', url: 'https://guidelines.vancouver.ca/H005.pdf', read: 'the November 2013 text was opened (H005_2013Nov20.pdf); the 2026 text was not' }, flag: 'unverified' },
  { id: 'hbp-gateways', layer: 'policy', label: 'Higher Buildings Policy · bridge gateways', value: '~152 m (500 ft) Burrard · ~130 m (425 ft) Granville',
    note: 'One prominent tower in axial alignment with the Burrard Bridge, two towers framing the Granville Bridge gateway; shoulder areas such as Alberni were raised from 400 to 500 ft in 2011.',
    source: { label: 'General Policy for Higher Buildings, November 2013; VPSN issue note on Vancouver Views (2011)', url: 'https://vancouverpublicspace.ca/uploads/IssueNote_VancouverViews.pdf', read: 'both opened' }, flag: 'unverified' },
  { id: 'hbp-review', layer: 'policy', label: 'Higher Buildings Policy · 2026 review', value: 'under review',
    note: 'The City launched its first comprehensive review since 2011 in April 2026 (public survey 1–31 May 2026, exhibit at the Vancouver Lookout); draft directions go to Council after further engagement. The protected mountain views stay unchanged.',
    source: { label: 'City of Vancouver, Higher Buildings Policy Review (shapeyourcity.ca/higher-buildings); memo of 2 April 2026', url: 'https://www.shapeyourcity.ca/higher-buildings', read: 'search excerpts; the City pages refused automated readers' }, flag: 'unverified' },
  { id: 'views', layer: 'views', label: 'Public views · protected view cones', value: '24 cones (from 16 origins)',
    note: 'On 10 July 2024 Council repealed the 1989 View Protection Guidelines for new Public Views Guidelines: of 38 views from 18 origins, 14 were removed (Laurel Landbridge, Cambie Bridge, Choklit Park, two at Queen Elizabeth Park, Granville Bridge 12.1, Granville St 20.2) and 11 redrawn; the mountain views are kept. A cone caps any building under it below its sightline, whatever the zoning.',
    source: { label: 'City of Vancouver news release, 10 July 2024; UDI summary of the Public Views Guidelines', url: 'https://udi.org/advocacy/updates/city-of-vancouver-public-views-and-solar-access-guidelines', read: 'UDI page opened; the City guidelines were not' }, flag: 'unverified' },
  { id: 'solar', layer: 'views', label: 'Solar access · downtown public spaces', value: 'review pending',
    note: 'The 2024 Solar Access Guidelines unified shadow rules outside downtown (about 85% of the city) and sent downtown\'s six shadow strategies to a separate review, with a proposal to shorten the protected window from 10:00–16:00 to 10:00–14:00 between the equinoxes.',
    source: { label: 'UDI summary of the 2024 Public Views and Solar Access Guidelines', url: 'https://udi.org/advocacy/updates/city-of-vancouver-public-views-and-solar-access-guidelines', read: 'opened' }, flag: 'unverified' },
  { id: 'built', layer: 'built', label: 'Built · the tallest downtown', value: '200.9 m (Living Shangri-La, 62 fl, 2009)',
    note: 'Then Paradox Hotel 187.8 m, The Butterfly 178.6 m, One Burrard Place 167.6 m. Nothing built reaches the policy\'s 700 ft; a 315 m supertall at 501–595 West Georgia was proposed in 2025.',
    source: { label: 'Wikipedia, List of tallest buildings in Vancouver', url: 'https://en.wikipedia.org/wiki/List_of_tallest_buildings_in_Vancouver', read: 'opened, 17 Nov 2026' }, flag: 'unverified' },
]

export const LAYER_NAME: Record<HeightFact['layer'], string> = { zoning: 'Zoning (Downtown ODP)', policy: 'Higher Buildings Policy', views: 'Public views and sun', built: 'Built context' }
