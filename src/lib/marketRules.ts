// "Smart" market filters: which categories and options make sense together.
// Steam doesn't say how its categories relate (e.g. which weapons are rifles), so these rules
// are written here, based on Steam's own category names. Only CS2 needs them so far; other
// games' categories don't depend on each other.

// ---------- CS2 ----------
const CS2_GUN_TYPES: Record<string, string[]> = {
  CSGO_Type_Rifle: ["ak47", "m4a1", "m4a1_silencer", "famas", "galilar", "aug", "sg556"],
  CSGO_Type_SniperRifle: ["awp", "ssg08", "scar20", "g3sg1"],
  CSGO_Type_SMG: ["mp9", "bizon", "mac10", "p90", "mp5sd", "ump45", "mp7"],
  CSGO_Type_Pistol: ["p250", "revolver", "tec9", "elite", "cz75a", "fiveseven", "glock", "deagle", "usp_silencer", "hkp2000"],
  CSGO_Type_Shotgun: ["sawedoff", "nova", "xm1014", "mag7"],
  CSGO_Type_Machinegun: ["m249", "negev"],
  CSGO_Type_Equipment: ["taser"],
};

/** CS2 type of a weapon tag ("weapon_ak47" -> "CSGO_Type_Rifle"); knives -> "CSGO_Type_Knife" */
function cs2TypeOfWeapon(weaponTag: string): string | null {
  const w = weaponTag.replace(/^weapon_/, "");
  if (w.startsWith("knife") || w === "bayonet") return "CSGO_Type_Knife";
  for (const [type, list] of Object.entries(CS2_GUN_TYPES)) if (list.includes(w)) return type;
  return null;
}

// Which categories (facet names after "730_") apply to each type
const WEAPON_FACETS = ["Type", "Weapon", "Exterior", "Quality", "Rarity", "ItemSet", "Tournament"];
const CS2_FACETS_BY_TYPE: Record<string, string[]> = {
  ...Object.fromEntries(Object.keys(CS2_GUN_TYPES).map((t) => [t, WEAPON_FACETS])),
  CSGO_Type_Knife: ["Type", "Weapon", "Exterior", "Quality", "Rarity"],
  Type_Hands: ["Type", "Exterior", "Quality", "Rarity"],
  CSGO_Tool_Sticker: ["Type", "StickerCapsule", "StickerCategory", "Tournament", "TournamentTeam", "ProPlayer", "Rarity", "Quality"],
  CSGO_Type_Spray: ["Type", "SprayCapsule", "SprayCategory", "SprayColorCategory", "Tournament", "TournamentTeam", "ProPlayer", "Rarity", "Quality"],
  CSGO_Tool_Patch: ["Type", "PatchCapsule", "PatchCategory", "Tournament", "TournamentTeam", "Rarity", "Quality"],
  CSGO_Tool_Keychain: ["Type", "KeychainCapsule", "Rarity", "Quality"],
  CSGO_Type_WeaponCase: ["Type", "Tournament", "Quality"],
  Type_CustomPlayer: ["Type", "Rarity", "Quality"],
  CSGO_Type_MusicKit: ["Type", "Rarity", "Quality"],
};
const OTHER_FACETS = ["Type", "Rarity", "Quality", "Tournament"];

/** The parts of the current selection the rules care about */
function selected(filters: string[], facetKey: string) {
  return filters.filter((f) => f.startsWith(facetKey + ":")).map((f) => f.slice(facetKey.length + 1));
}

/** Is this category useful with the current selection? */
export function facetApplies(appid: number, facetKey: string, filters: string[]): boolean {
  if (appid !== 730) return true;
  const name = facetKey.slice("730_".length);
  const types = selected(filters, "730_Type");
  const weapons = selected(filters, "730_Weapon");
  if (types.length) {
    return types.some((t) => (CS2_FACETS_BY_TYPE[t] ?? OTHER_FACETS).includes(name));
  }
  if (weapons.length) {
    // A weapon was picked: only weapon-skin categories make sense
    return [...WEAPON_FACETS, "Exterior"].includes(name);
  }
  return true;
}

/** Is this option useful with the current selection? (e.g. only rifles when "Rifle" is ticked) */
export function tagApplies(appid: number, facetKey: string, tagId: string, filters: string[]): boolean {
  if (appid !== 730) return true;
  const types = selected(filters, "730_Type");
  const weapons = selected(filters, "730_Weapon");
  if (facetKey === "730_Weapon" && types.length) {
    const t = cs2TypeOfWeapon(tagId);
    return t != null && types.includes(t);
  }
  if (facetKey === "730_Type" && weapons.length && !types.length) {
    // Weapons picked first: only show their types
    return weapons.some((w) => cs2TypeOfWeapon(w) === tagId);
  }
  return true;
}

/** Remove ticks that no longer fit (so no invisible filters stay active).
 *  The item type is the "main" choice: it always stays, and other ticks must fit it. */
export function pruneFilters(appid: number, filters: string[]): string[] {
  if (appid !== 730) return filters;
  const types = selected(filters, "730_Type");
  return filters.filter((f) => {
    const [facet, tag] = f.split(":");
    if (facet === "730_Type") return true;
    if (!facetApplies(appid, facet, filters)) return false;
    if (facet === "730_Weapon" && types.length) {
      const t = cs2TypeOfWeapon(tag);
      return t != null && types.includes(t);
    }
    return true;
  });
}
