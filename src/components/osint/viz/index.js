// Central viz picker. Every OSINT tool card looks up its viz here.
//
// Adding a new custom viz:
//   1. Create the component under this folder
//   2. Import + register it in `VIZ_BY_TOOL`
//
// Anything unmapped falls through to `GenericViz`, which walks the JSON tree
// and renders a KV grid — so a new BE tool "just works" without a FE change.

import IpViz          from './IpViz.jsx'
import AsnViz         from './AsnViz.jsx'
import DomainViz      from './DomainViz.jsx'
import MxViz          from './MxViz.jsx'
import PhoneViz       from './PhoneViz.jsx'
import GenderViz      from './GenderViz.jsx'
import AgeViz         from './AgeViz.jsx'
import NationalityViz from './NationalityViz.jsx'
import CardViz        from './CardViz.jsx'
import CryptoViz      from './CryptoViz.jsx'
import FxViz          from './FxViz.jsx'
import BankViz        from './BankViz.jsx'
import WikipediaViz   from './WikipediaViz.jsx'
import WikidataViz    from './WikidataViz.jsx'
import BookViz        from './BookViz.jsx'
import UrbanViz       from './UrbanViz.jsx'
import AsteroidViz    from './AsteroidViz.jsx'
import AqiViz         from './AqiViz.jsx'
import UserViz        from './UserViz.jsx'
import ImageViz       from './ImageViz.jsx'
import JokeViz        from './JokeViz.jsx'
import GithubUserViz  from './GithubUserViz.jsx'
import GithubRepoViz  from './GithubRepoViz.jsx'
import LocationViz    from './LocationViz.jsx'
import WeatherViz     from './WeatherViz.jsx'
import GenericViz     from './GenericViz.jsx'

export const VIZ_BY_TOOL = {
  ipwho: IpViz, 'ipapi-lite': IpViz, ipify: IpViz,
  bgpview: AsnViz, peeringdb: AsnViz,
  rdap: DomainViz, dnslytics: DomainViz,
  mxrecords: MxViz,
  phone: PhoneViz,
  genderize: GenderViz, agify: AgeViz, nationalize: NationalityViz,
  binlist: CardViz,
  coingecko: CryptoViz, exchangerate: FxViz,
  fdic: BankViz,
  wikipedia: WikipediaViz, wikidata: WikidataViz,
  openlibrary: BookViz, urban: UrbanViz,
  'nasa-neo': AsteroidViz, waqi: AqiViz,
  randomuser: UserViz, picsum: ImageViz, joke: JokeViz,
  'github-user': GithubUserViz, 'github-repo': GithubRepoViz,
  nominatim: LocationViz, 'open-meteo': WeatherViz,
}

export { GenericViz }

export function pickViz(toolName) {
  return VIZ_BY_TOOL[toolName] || GenericViz
}
