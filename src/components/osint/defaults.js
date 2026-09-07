// Per-tool default inputs — used to auto-fire each tool card 800ms after
// mount (staggered) so the page loads useful results as you scroll.
//
// Keys are tool.name (must match the BE `services/osint/index.js` registry).
// Values are objects keyed by the paramSchema `key` — the same shape as the
// per-tool `inputs` state in OsintHub.

export const TOOL_DEFAULTS = {
  // Network
  ipwho:         { ip: '8.8.8.8' },
  'ipapi-lite':  { ip: '1.1.1.1' },
  ipify:         {},
  bgpview:       { asn: '15169' },      // Google
  peeringdb:     { asn: '15169' },
  rdap:          { domain: 'github.com' },
  dnslytics:     { ip: '8.8.8.8' },
  mxrecords:     { domain: 'github.com' },
  phone:         { num: '+14155552671' }, // classic US example
  // Identity / name
  genderize:     { name: 'Sarah' },
  agify:         { name: 'Sarah' },
  nationalize:   { name: 'Sarah' },
  // Finance
  binlist:       { bin: '45717360' },  // Visa
  coingecko:     { coinId: 'bitcoin' },
  exchangerate:  { base: 'USD', target: 'EUR' },
  fdic:          { name: 'JPMorgan', limit: '5' },
  // Knowledge
  wikipedia:     { query: 'Ada Lovelace' },
  wikidata:      { query: 'Ada Lovelace' },
  openlibrary:   { isbn: '9780140328721' }, // Fantastic Mr Fox
  urban:         { term: 'yeet' },
  // Science / environment
  'nasa-neo':    { date: new Date().toISOString().slice(0, 10) },
  waqi:          { city: 'new-york' },
  openaq:        { limit: '5' },
  // Fun / demo
  randomuser:    {},
  picsum:        { limit: '6' },
  joke:          {},
  // GitHub
  'github-user': { user: 'torvalds' },
  'github-repo': { owner: 'torvalds', repo: 'linux' },
  // Location / weather
  nominatim:     { query: 'Times Square' },
  'open-meteo':  { lat: '40.7', lng: '-74.0' },
  // Threat intel (need keys — safe to auto-fire, they'll 501 politely)
  urlscan:       { query: 'github.com' },
  otx:           { query: 'github.com' },
}

// How many milliseconds to stagger between successive card fires. Staggered
// so 30 tools don't hammer the BE simultaneously — 80ms × 30 = 2.4s total
// which is well under any perceivable wait for a scroll-into-view flow.
export const STAGGER_MS = 80

// How long after mount before the first fire kicks off. Gives the initial
// paint a moment to settle before we start firing network requests.
export const KICKOFF_DELAY_MS = 400
