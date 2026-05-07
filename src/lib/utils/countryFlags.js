/**
 * Mapping nom de pays (renvoyé par FootyStats league-list) → code ISO 3166-1 alpha-2.
 * Utilisé pour générer les URLs de drapeaux via flagcdn.com.
 *
 * flagcdn supporte également les subdivisions UK (gb-eng, gb-sct, gb-wls, gb-nir).
 *
 * Couvre les pays qui apparaissent typiquement dans les 51 ligues choisies
 * sur FootyStats. Si un pays manque, `flagUrl()` retourne null et l'UI
 * doit afficher un fallback.
 */

const COUNTRY_TO_ISO = {
  // Europe — UK & Ireland
  'England': 'gb-eng',
  'Scotland': 'gb-sct',
  'Wales': 'gb-wls',
  'Northern Ireland': 'gb-nir',
  'Ireland': 'ie',

  // Europe — Western
  'France': 'fr',
  'Germany': 'de',
  'Spain': 'es',
  'Portugal': 'pt',
  'Italy': 'it',
  'Netherlands': 'nl',
  'Belgium': 'be',
  'Luxembourg': 'lu',
  'Switzerland': 'ch',
  'Austria': 'at',

  // Europe — Nordic
  'Denmark': 'dk',
  'Sweden': 'se',
  'Norway': 'no',
  'Finland': 'fi',
  'Iceland': 'is',

  // Europe — Eastern & Central
  'Poland': 'pl',
  'Czech Republic': 'cz',
  'Czechia': 'cz',
  'Slovakia': 'sk',
  'Hungary': 'hu',
  'Romania': 'ro',
  'Bulgaria': 'bg',
  'Russia': 'ru',
  'Ukraine': 'ua',
  'Belarus': 'by',
  'Moldova': 'md',
  'Estonia': 'ee',
  'Latvia': 'lv',
  'Lithuania': 'lt',

  // Europe — Balkans
  'Croatia': 'hr',
  'Serbia': 'rs',
  'Slovenia': 'si',
  'Bosnia and Herzegovina': 'ba',
  'Bosnia': 'ba',
  'Montenegro': 'me',
  'North Macedonia': 'mk',
  'Macedonia': 'mk',
  'Albania': 'al',
  'Kosovo': 'xk',
  'Greece': 'gr',
  'Cyprus': 'cy',
  'Turkey': 'tr',
  'Malta': 'mt',

  // Americas — North & Central
  'USA': 'us',
  'United States': 'us',
  'Canada': 'ca',
  'Mexico': 'mx',
  'Costa Rica': 'cr',
  'Honduras': 'hn',
  'Panama': 'pa',
  'Guatemala': 'gt',
  'El Salvador': 'sv',
  'Jamaica': 'jm',

  // Americas — South
  'Brazil': 'br',
  'Argentina': 'ar',
  'Chile': 'cl',
  'Colombia': 'co',
  'Uruguay': 'uy',
  'Paraguay': 'py',
  'Peru': 'pe',
  'Ecuador': 'ec',
  'Venezuela': 've',
  'Bolivia': 'bo',

  // Asia
  'Japan': 'jp',
  'South Korea': 'kr',
  'Korea Republic': 'kr',
  'North Korea': 'kp',
  'China': 'cn',
  'India': 'in',
  'Vietnam': 'vn',
  'Thailand': 'th',
  'Malaysia': 'my',
  'Indonesia': 'id',
  'Singapore': 'sg',
  'Philippines': 'ph',
  'Hong Kong': 'hk',
  'Taiwan': 'tw',
  'Iran': 'ir',
  'Iraq': 'iq',
  'Israel': 'il',
  'Saudi Arabia': 'sa',
  'Qatar': 'qa',
  'United Arab Emirates': 'ae',
  'UAE': 'ae',
  'Bahrain': 'bh',
  'Kuwait': 'kw',
  'Jordan': 'jo',
  'Lebanon': 'lb',
  'Oman': 'om',
  'Uzbekistan': 'uz',
  'Kazakhstan': 'kz',

  // Africa
  'Egypt': 'eg',
  'Morocco': 'ma',
  'Algeria': 'dz',
  'Tunisia': 'tn',
  'Libya': 'ly',
  'South Africa': 'za',
  'Nigeria': 'ng',
  'Ghana': 'gh',
  'Senegal': 'sn',
  'Cameroon': 'cm',
  "Côte d'Ivoire": 'ci',
  'Ivory Coast': 'ci',
  'Kenya': 'ke',
  'Ethiopia': 'et',
  'Angola': 'ao',
  'DR Congo': 'cd',

  // Oceania
  'Australia': 'au',
  'New Zealand': 'nz',

  // International
  'International': null,
  'World': null,
  'Europe': null,
};

/**
 * Retourne l'URL d'un drapeau (SVG, scalable) pour un nom de pays,
 * ou null si le pays n'est pas connu.
 *
 * @param {string} countryName — nom retourné par FootyStats (ex: "England")
 * @returns {string|null} — ex: "https://flagcdn.com/gb-eng.svg" ou null
 */
export function flagUrl(countryName) {
  if (!countryName) return null;
  const iso = COUNTRY_TO_ISO[countryName];
  if (!iso) return null;
  return `https://flagcdn.com/${iso}.svg`;
}

/**
 * Pour debug — liste les noms de pays connus.
 */
export function knownCountries() {
  return Object.keys(COUNTRY_TO_ISO);
}
