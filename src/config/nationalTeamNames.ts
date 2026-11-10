/**
 * Milli takım adları Türkçe: API-Football İngilizce ülke adı verir ("Italy", "Norway"). Ad → ISO2 tablosu AF `countries`
 * cevabından (2026-09-29, __fixtures__/countries.json); görünen ad `Intl.DisplayNames('tr')` (sunucu ve tarayıcıda aynı ICU).
 * AF'nin kısaltma / farklı yazımları ve ISO kodu olmayan takımlar elle (OVERRIDES). Bilinmeyen ad olduğu gibi kalır.
 */
const ISO2: Record<string, string> = {
  "Albania": "AL",
  "Algeria": "DZ",
  "Andorra": "AD",
  "Angola": "AO",
  "Antigua-And-Barbuda": "AG",
  "Argentina": "AR",
  "Armenia": "AM",
  "Aruba": "AW",
  "Australia": "AU",
  "Austria": "AT",
  "Azerbaijan": "AZ",
  "Bahrain": "BH",
  "Bangladesh": "BD",
  "Barbados": "BB",
  "Belarus": "BY",
  "Belgium": "BE",
  "Belize": "BZ",
  "Benin": "BJ",
  "Bermuda": "BM",
  "Bhutan": "BT",
  "Bolivia": "BO",
  "Bosnia": "BA",
  "Botswana": "BW",
  "Brazil": "BR",
  "Bulgaria": "BG",
  "Burkina-Faso": "BF",
  "Burundi": "BI",
  "Cambodia": "KH",
  "Cameroon": "CM",
  "Canada": "CA",
  "Chile": "CL",
  "China": "CN",
  "Chinese-Taipei": "TW",
  "Colombia": "CO",
  "Congo": "CG",
  "Congo-DR": "CD",
  "Costa-Rica": "CR",
  "Crimea": "UA",
  "Croatia": "HR",
  "Cuba": "CU",
  "Curacao": "CW",
  "Cyprus": "CY",
  "Czech-Republic": "CZ",
  "Denmark": "DK",
  "Dominican-Republic": "DO",
  "Ecuador": "EC",
  "Egypt": "EG",
  "El-Salvador": "SV",
  "Estonia": "EE",
  "Eswatini": "SZ",
  "Ethiopia": "ET",
  "Faroe-Islands": "FO",
  "Fiji": "FJ",
  "Finland": "FI",
  "France": "FR",
  "Gabon": "GA",
  "Gambia": "GM",
  "Georgia": "GE",
  "Germany": "DE",
  "Ghana": "GH",
  "Gibraltar": "GI",
  "Greece": "GR",
  "Grenada": "GD",
  "Guadeloupe": "GP",
  "Guatemala": "GT",
  "Guinea": "GN",
  "Haiti": "HT",
  "Honduras": "HN",
  "Hong-Kong": "HK",
  "Hungary": "HU",
  "Iceland": "IS",
  "India": "IN",
  "Indonesia": "ID",
  "Iran": "IR",
  "Iraq": "IQ",
  "Ireland": "IE",
  "Israel": "IL",
  "Italy": "IT",
  "Ivory-Coast": "CI",
  "Jamaica": "JM",
  "Japan": "JP",
  "Jordan": "JO",
  "Kazakhstan": "KZ",
  "Kenya": "KE",
  "Kosovo": "XK",
  "Kuwait": "KW",
  "Kyrgyzstan": "KG",
  "Laos": "LA",
  "Latvia": "LV",
  "Lebanon": "LB",
  "Lesotho": "LS",
  "Liberia": "LR",
  "Libya": "LY",
  "Liechtenstein": "LI",
  "Lithuania": "LT",
  "Luxembourg": "LU",
  "Macao": "MO",
  "Macedonia": "MK",
  "Malawi": "MW",
  "Malaysia": "MY",
  "Maldives": "MV",
  "Mali": "ML",
  "Malta": "MT",
  "Mauritania": "MR",
  "Mauritius": "MU",
  "Mexico": "MX",
  "Moldova": "MD",
  "Mongolia": "MN",
  "Montenegro": "ME",
  "Morocco": "MA",
  "Myanmar": "MM",
  "Namibia": "NA",
  "Nepal": "NP",
  "Netherlands": "NL",
  "New-Zealand": "NZ",
  "Nicaragua": "NI",
  "Nigeria": "NG",
  "Norway": "NO",
  "Oman": "OM",
  "Pakistan": "PK",
  "Palestine": "PS",
  "Panama": "PA",
  "Paraguay": "PY",
  "Peru": "PE",
  "Philippines": "PH",
  "Poland": "PL",
  "Portugal": "PT",
  "Qatar": "QA",
  "Romania": "RO",
  "Russia": "RU",
  "Rwanda": "RW",
  "San-Marino": "SM",
  "Saudi-Arabia": "SA",
  "Senegal": "SN",
  "Serbia": "RS",
  "Singapore": "SG",
  "Slovakia": "SK",
  "Slovenia": "SI",
  "Somalia": "SO",
  "South-Africa": "ZA",
  "South-Korea": "KR",
  "Spain": "ES",
  "Sudan": "SD",
  "Suriname": "SR",
  "Sweden": "SE",
  "Switzerland": "CH",
  "Syria": "SY",
  "Tajikistan": "TJ",
  "Tanzania": "TZ",
  "Thailand": "TH",
  "Togo": "TG",
  "Trinidad-And-Tobago": "TT",
  "Tunisia": "TN",
  "Turkey": "TR",
  "Turkmenistan": "TM",
  "USA": "US",
  "Uganda": "UG",
  "Ukraine": "UA",
  "United-Arab-Emirates": "AE",
  "Uruguay": "UY",
  "Uzbekistan": "UZ",
  "Venezuela": "VE",
  "Vietnam": "VN",
  "Yemen": "YE",
  "Zambia": "ZM",
  "Zimbabwe": "ZW"
};

/** Elle Türkçe (ISO adı yetersiz / AF'nin kısaltması): anahtar normalize edilir (küçük harf, tire → boşluk). */
const OVERRIDES: Record<string, string> = {
  England: 'İngiltere',
  Scotland: 'İskoçya',
  Wales: 'Galler',
  'Northern Ireland': 'Kuzey İrlanda',
  'Rep. Of Ireland': 'İrlanda',
  'Republic of Ireland': 'İrlanda',
  USA: 'ABD',
  'United States': 'ABD',
  'Korea Republic': 'Güney Kore',
  'South Korea': 'Güney Kore',
  'Korea DPR': 'Kuzey Kore',
  'North Korea': 'Kuzey Kore',
  Curacao: 'Curaçao',
  Turkey: 'Türkiye',
  Türkiye: 'Türkiye',
  Turkiye: 'Türkiye',
  Swaziland: 'Esvatini',
  'Faroe Islands': 'Faroe Adaları',
  'Chinese Taipei': 'Çin Taipei',
  Taiwan: 'Çin Taipei',
  'Hong Kong': 'Hong Kong',
  'Congo DR': 'Kongo DC',
  'DR Congo': 'Kongo DC',
  'Democratic Republic of the Congo': 'Kongo DC',
  Congo: 'Kongo',
  'Congo Republic': 'Kongo',
};

/** AF'nin ISO adından farklı yazdığı ülkeler → ISO2 (normalize anahtar). */
const ALIASES: Record<string, string> = {
  'fyr macedonia': 'MK',
  'f.y.r. macedonia': 'MK',
  macedonia: 'MK',
  'north macedonia': 'MK',
  czechia: 'CZ',
  'czech republic': 'CZ',
  'bosnia & herzegovina': 'BA',
  'bosnia and herzegovina': 'BA',
  bosnia: 'BA',
  'ivory coast': 'CI',
  "cote d'ivoire": 'CI',
  "côte d'ivoire": 'CI',
  'cape verde': 'CV',
  'cape verde islands': 'CV',
  'cabo verde': 'CV',
  'east timor': 'TL',
  'timor leste': 'TL',
  'st. kitts and nevis': 'KN',
  'st. lucia': 'LC',
  'st. vincent / grenadines': 'VC',
  'st. vincent and the grenadines': 'VC',
  'sao tome and principe': 'ST',
  'são tomé and príncipe': 'ST',
  'guinea bissau': 'GW',
  'equatorial guinea': 'GQ',
  'trinidad and tobago': 'TT',
  'antigua and barbuda': 'AG',
  'united arab emirates': 'AE',
  'turks and caicos islands': 'TC',
  'us virgin islands': 'VI',
  'u.s. virgin islands': 'VI',
  'british virgin islands': 'VG',
  'macau': 'MO',
  'tahiti': 'PF',
  'new caledonia': 'NC',
  'myanmar': 'MM',
  'burma': 'MM',
  'palestine': 'PS',
  'kosovo': 'XK',
  'swaziland': 'SZ',
  'eswatini': 'SZ',
};

const norm = (s: string) => s.trim().toLowerCase().replace(/-/g, ' ').replace(/\s+/g, ' ');

const trRegions = (() => {
  try {
    return new Intl.DisplayNames(['tr'], { type: 'region' });
  } catch {
    return null;
  }
})();

/** İngilizce ICU ülke adı → ISO2 (ISO2 tablosunda olmayan ad için sistematik yedek). */
const enReverse: Map<string, string> = (() => {
  const map = new Map<string, string>();
  try {
    const en = new Intl.DisplayNames(['en'], { type: 'region' });
    for (let a = 65; a <= 90; a++) {
      for (let b = 65; b <= 90; b++) {
        const code = String.fromCharCode(a, b);
        const name = en.of(code);
        if (name && name !== code) map.set(norm(name), code);
      }
    }
  } catch {
    // yedek: yalnız tablolar
  }
  return map;
})();

const OVERRIDES_NORM = new Map(Object.entries(OVERRIDES).map(([k, v]) => [norm(k), v]));
const ISO2_NORM = new Map(Object.entries(ISO2).map(([k, v]) => [norm(k), v]));

/** AF milli takım / ülke adı → Türkçe. Sıra: elle tablo → ISO2 (tablo, takma ad, ICU İngilizce adı) → `Intl.DisplayNames('tr')`; hiçbiri değilse ad olduğu gibi. */
export function nationalTeamNameTr(name: string): string {
  const key = norm(name);
  const manual = OVERRIDES_NORM.get(key);
  if (manual) return manual;
  const iso = ALIASES[key] ?? ISO2_NORM.get(key) ?? enReverse.get(key);
  if (iso && trRegions) {
    try {
      const tr = trRegions.of(iso);
      if (tr && tr !== iso) return tr;
    } catch {
      // yedek: İngilizce ad
    }
  }
  return name;
}
