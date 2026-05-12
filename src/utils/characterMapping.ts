// Character mapping from display names to SVG file names
// Based on https://github.com/marcrd/smash-ultimate-assets/tree/master/stock-icons/svg

export const characterToFileMapping: Record<string, string> = {
  // Base roster - Updated to match actual GitHub repository file names
  MARIO: "mario",
  "DONKEY KONG": "donkey_kong",
  LINK: "link",
  SAMUS: "samus",
  "DARK SAMUS": "dark_samus",
  YOSHI: "yoshi",
  KIRBY: "kirby",
  FOX: "fox",
  PIKACHU: "pikachu",
  LUIGI: "luigi",
  NESS: "ness",
  "CAPTAIN FALCON": "captain_falcon",
  JIGGLYPUFF: "jigglypuff",
  PEACH: "peach",
  DAISY: "daisy",
  BOWSER: "bowser",
  "ICE CLIMBERS": "ice_climbers",
  SHEIK: "sheik",
  ZELDA: "zelda",
  "DR. MARIO": "dr_mario",
  PICHU: "pichu",
  FALCO: "falco",
  MARTH: "marth",
  LUCINA: "lucina",
  "YOUNG LINK": "young_link",
  GANONDORF: "ganondorf",
  MEWTWO: "mewtwo",
  ROY: "roy",
  CHROM: "chrom",
  ROB: "r_o_b",
  "MR. GAME & WATCH": "mr_game_and_watch",
  "META KNIGHT": "meta_knight",
  PIT: "pit",
  "DARK PIT": "dark_pit",
  "ZERO SUIT SAMUS": "zero_suit_samus",
  WARIO: "wario",
  SNAKE: "snake",
  IKE: "ike",
  "POKEMON TRAINER": "pokemon_trainer",
  "DIDDY KONG": "diddy_kong",
  LUCAS: "lucas",
  SONIC: "sonic",
  "KING DEDEDE": "king_dedede",
  OLIMAR: "olimar",
  LUCARIO: "lucario",
  "R.O.B.": "r_o_b",
  "TOON LINK": "toon_link",
  WOLF: "wolf",
  VILLAGER: "villager",
  "MEGA MAN": "mega_man",
  "WII FIT TRAINER": "wii_fit_trainer",
  "ROSALINA & LUMA": "rosalina_and_luma",
  "LITTLE MAC": "little_mac",
  GRENINJA: "greninja",
  // Mii Fighters use a single file in the repository
  "MII BRAWLER": "mii_fighter",
  "MII SWORDFIGHTER": "mii_fighter",
  "MII GUNNER": "mii_fighter",
  PALUTENA: "palutena",
  "PAC-MAN": "pac_man",
  ROBIN: "robin",
  SHULK: "shulk",
  "BOWSER JR.": "bowser_jr",
  "DUCK HUNT": "duck_hunt",
  RYU: "ryu",
  KEN: "ken",
  CLOUD: "cloud",
  CORRIN: "corrin",
  BAYONETTA: "bayonetta",

  // DLC characters that are available in the repository
  INKLING: "inkling",
  RIDLEY: "ridley",
  SIMON: "simon",
  RICHTER: "richter",
  "KING K. ROOL": "king_k_rool",
  ISABELLE: "isabelle",
  INCINEROAR: "incineroar",
  "PIRANHA PLANT": "piranha-plant", // Updated to match filename

  // DLC characters now available in local SVG folder
  STEVE: "steve",
  JOKER: "joker",
  HERO: "hero",
  "BANJO & KAZOOIE": "banjo_and_kazooie",
  TERRY: "Terry", // Note: capital T in filename
  BYLETH: "byleth",
  "MIN MIN": "min_min",
  SEPHIROTH: "sephiroth",
  PYRA: "homura", // Pyra's Japanese name in filename
  MYTHRA: "homura",
  "PYRA/MYTHRA": "homura", // Both Pyra and Mythra use same file
  KAZUYA: "kazuya",
  SORA: "sora",
};

const specialMappings: Record<string, string> = {
  // Minecraft skins map to Steve
  ENDERMAN: "STEVE",
  STEVE: "STEVE",
  ALEX: "STEVE",
  ZOMBIE: "STEVE",
  "MINECRAFT STEVE": "STEVE",
  "MINECRAFT ALEX": "STEVE",
  ALPH: "OLIMAR",
  "BOWSER JR": "BOWSER JR.",
  "BOWSER JUNIOR": "BOWSER JR.",
  "LARRY KOOPA": "BOWSER JR.",
  LARRY: "BOWSER JR.",
  "WENDY O KOOPA": "BOWSER JR.",
  "WENDY O. KOOPA": "BOWSER JR.",
  WENDY: "BOWSER JR.",
  "IGGY KOOPA": "BOWSER JR.",
  IGGY: "BOWSER JR.",
  "MORTON KOOPA JR": "BOWSER JR.",
  "MORTON KOOPA JR.": "BOWSER JR.",
  MORTON: "BOWSER JR.",
  "LEMMY KOOPA": "BOWSER JR.",
  LEMMY: "BOWSER JR.",
  "LUDWIG VON KOOPA": "BOWSER JR.",
  LUDWIG: "BOWSER JR.",
  "ROY KOOPA": "BOWSER JR.",
  SQUIRTLE: "POKEMON TRAINER",
  IVYSAUR: "POKEMON TRAINER",
  CHARIZARD: "POKEMON TRAINER",
  ERDRICK: "HERO",
  SOLO: "HERO",
  EIGHT: "HERO",
  LUMINARY: "HERO",
  "R.O.B.": "R.O.B.",
  "R.O.B": "R.O.B.",
  ROB: "R.O.B.",
  "R O B": "R.O.B.",
  "MR. GAME & WATCH": "MR. GAME & WATCH",
  "MR GAME & WATCH": "MR. GAME & WATCH",
  "MR GAME AND WATCH": "MR. GAME & WATCH",
  "MR. GAME AND WATCH": "MR. GAME & WATCH",
  "GAME & WATCH": "MR. GAME & WATCH",
  "GAME AND WATCH": "MR. GAME & WATCH",
  "G&W": "MR. GAME & WATCH",
  // Characters that might be stored differently in the database
  "KING K ROOL": "KING K. ROOL",
  "KING K. ROOL": "KING K. ROOL",
  ROSALINA: "ROSALINA & LUMA",
  LUMA: "ROSALINA & LUMA",
  "ROSALINA & LUMA": "ROSALINA & LUMA",
  "POKEMON TRAINER": "POKEMON TRAINER",
  "POKEMON TRAINER: SQUIRTLE": "POKEMON TRAINER",
  "POKEMON TRAINER: IVYSAUR": "POKEMON TRAINER",
  "POKEMON TRAINER: CHARIZARD": "POKEMON TRAINER",
  PYRA: "PYRA/MYTHRA",
  MYTHRA: "PYRA/MYTHRA",
  "PYRA/MYTHRA": "PYRA/MYTHRA",
  "PYRA & MYTHRA": "PYRA/MYTHRA",
  "PYRA AND MYTHRA": "PYRA/MYTHRA",
  AEGIS: "PYRA/MYTHRA",
  PYTHRA: "PYRA/MYTHRA",
  "BANJO-KAZOOIE": "BANJO & KAZOOIE",
  "BANJO KAZOOIE": "BANJO & KAZOOIE",
  BANJO: "BANJO & KAZOOIE",
  "PAC MAN": "PAC-MAN",
  "DUCK HUNT DUO": "DUCK HUNT",
  "DUCK HUNT DOG": "DUCK HUNT",
};

const canonicalDisplayMappings: Record<string, string> = {
  STEVE: "STEVE",
  OLIMAR: "Olimar",
  "BOWSER JR.": "Bowser Jr.",
  HERO: "Hero",
  "BANJO & KAZOOIE": "Banjo & Kazooie",
  "KING K. ROOL": "KING K. ROOL",
  "ROSALINA & LUMA": "ROSALINA & LUMA",
  "POKEMON TRAINER": "POK\u00c9MON TRAINER",
  "PYRA/MYTHRA": "PYRA/MYTHRA",
  "R.O.B.": "R.O.B.",
  "MR. GAME & WATCH": "MR. GAME & WATCH",
  "PAC-MAN": "Pac-Man",
  "DUCK HUNT": "Duck Hunt",
};

const characterAliasQueryValues: Record<string, string[]> = {
  STEVE: ["Steve", "Alex", "Enderman", "Zombie", "Minecraft Steve", "Minecraft Alex"],
  OLIMAR: ["Olimar", "Alph"],
  "BOWSER JR.": [
    "Bowser Jr.",
    "Bowser Jr",
    "Bowser Junior",
    "Larry",
    "Larry Koopa",
    "Wendy",
    "Wendy O. Koopa",
    "Iggy",
    "Iggy Koopa",
    "Morton",
    "Morton Koopa Jr.",
    "Lemmy",
    "Lemmy Koopa",
    "Ludwig",
    "Ludwig von Koopa",
    "Roy Koopa",
  ],
  HERO: ["Hero", "Erdrick", "Solo", "Eight", "Luminary"],
  "KING K. ROOL": ["King K. Rool", "King K Rool"],
  "ROSALINA & LUMA": ["Rosalina & Luma", "Rosalina", "Luma"],
  "POKEMON TRAINER": [
    "Pokemon Trainer",
    "POKEMON TRAINER",
    "POK\u00c9MON TRAINER",
    "Squirtle",
    "Ivysaur",
    "Charizard",
    "Pokemon Trainer: Squirtle",
    "Pokemon Trainer: Ivysaur",
    "Pokemon Trainer: Charizard",
  ],
  "PYRA/MYTHRA": [
    "Pyra/Mythra",
    "Pyra & Mythra",
    "Pyra and Mythra",
    "Pyra",
    "Mythra",
    "Aegis",
    "Pythra",
  ],
  "R.O.B.": ["R.O.B.", "R.O.B", "ROB", "R O B"],
  "MR. GAME & WATCH": [
    "Mr. Game & Watch",
    "Mr Game & Watch",
    "Mr. Game and Watch",
    "Mr Game and Watch",
    "Game & Watch",
    "Game and Watch",
    "G&W",
  ],
  "BANJO & KAZOOIE": [
    "Banjo & Kazooie",
    "Banjo-Kazooie",
    "Banjo Kazooie",
    "Banjo",
  ],
  "PAC-MAN": ["Pac-Man", "Pac Man"],
  "DUCK HUNT": ["Duck Hunt", "Duck Hunt Duo", "Duck Hunt Dog"],
};

const stripDiacritics = (value: string) =>
  value.normalize("NFD").replace(/[\u0300-\u036f]/g, "");

export function getCharacterIcon(characterName: string): string {
  const normalizedName = normalizeCharacterName(characterName);
  const fileName = characterToFileMapping[normalizedName];
  if (!fileName) {
    console.warn(
      `Character icon not found for: ${characterName} (normalized: ${normalizedName})`,
    );
    return "/images/svgs/mario.svg"; // fallback to mario icon
  }
  return `/images/svgs/${fileName}.svg`;
}

export function getCharacterIconUrl(characterName: string): string {
  const normalizedName = normalizeCharacterName(characterName);
  const fileName = characterToFileMapping[normalizedName];
  if (!fileName) {
    return "/images/svgs/mario.svg"; // fallback to mario icon
  }
  return `/images/svgs/${fileName}.svg`;
}

export function getCanonicalCharacterName(characterName: string): string {
  const trimmedName = characterName.trim();

  if (!trimmedName) {
    return "";
  }

  const normalizedName = normalizeCharacterName(trimmedName);
  return canonicalDisplayMappings[normalizedName] || trimmedName;
}

export function expandCharacterAliasQueryValues(characterName: string): string[] {
  const trimmedName = characterName.trim();

  if (!trimmedName) {
    return [];
  }

  const normalizedName = normalizeCharacterName(trimmedName);
  const aliases = characterAliasQueryValues[normalizedName] || [trimmedName];
  const values = new Set<string>();

  for (const alias of aliases) {
    const trimmedAlias = alias.trim();

    if (!trimmedAlias) {
      continue;
    }

    const normalizedAlias = normalizeCharacterName(trimmedAlias);
    const strippedAlias = stripDiacritics(trimmedAlias);

    values.add(trimmedAlias);

    if (strippedAlias !== trimmedAlias) {
      values.add(strippedAlias);
    }

    values.add(strippedAlias.toUpperCase());
    values.add(strippedAlias.toLowerCase());

    if (normalizedAlias) {
      values.add(normalizedAlias);

      const canonicalDisplayName = canonicalDisplayMappings[normalizedAlias];
      if (canonicalDisplayName) {
        values.add(canonicalDisplayName);
      }
    }
  }

  if (normalizedName) {
    values.add(normalizedName);

    const canonicalDisplayName = canonicalDisplayMappings[normalizedName];
    if (canonicalDisplayName) {
      values.add(canonicalDisplayName);
    }
  }

  return Array.from(values);
}

// Helper function to normalize character names (handle ALL CAPS, etc.)
export function normalizeCharacterName(characterName: string): string {
  if (!characterName) return "";

  const normalizedInput = stripDiacritics(characterName.trim());

  // Convert to uppercase for lookup
  const upperCase = normalizedInput
    .toLowerCase()
    .split(" ")
    .map((word) => {
      // Handle special cases
      if (word === "and") return "&";
      if (word === "r.o.b.") return "R.O.B.";
      if (word === "mr.") return "MR.";
      if (word === "dr.") return "DR.";
      if (word === "jr.") return "JR.";

      // Capitalize first letter
      return word.charAt(0).toUpperCase() + word.slice(1);
    })
    .join(" ")
    .toUpperCase();

  return specialMappings[upperCase] || upperCase;
}
