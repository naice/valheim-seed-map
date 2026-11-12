// Katalog der Valheim-Locations: Prefab-Name -> Kategorie + lesbare Bezeichnung.

import { stableHash } from './worldgen.js';

export const CATEGORIES = [
  { id: 'boss', label: 'Bosse & Start', color: '#e5484d', big: true, on: true },
  { id: 'vendor', label: 'Händler & Quests', color: '#f5c518', big: true, on: true },
  { id: 'dungeon', label: 'Dungeons & Höhlen', color: '#b07cf7', on: true },
  { id: 'resource', label: 'Ressourcen & Besonderes', color: '#ff9f43', on: false },
  { id: 'lore', label: 'Runensteine & Lore', color: '#7fd4ff', on: false },
  { id: 'meadows', label: 'Wiesen', color: '#a8d05c', on: false },
  { id: 'forest', label: 'Schwarzwald', color: '#4f9d69', on: false },
  { id: 'swamp', label: 'Sumpf', color: '#b08968', on: false },
  { id: 'mountain', label: 'Berge', color: '#dfe7ee', on: false },
  { id: 'plains', label: 'Ebenen', color: '#f0c27b', on: false },
  { id: 'ocean', label: 'Ozean', color: '#5fa8d3', on: false },
  { id: 'mistlands', label: 'Nebellande', color: '#9aa0c8', on: false },
  { id: 'ashlands', label: 'Aschelande', color: '#d9603b', on: false },
  { id: 'deepnorth', label: 'Tiefer Norden', color: '#9be3e8', on: false },
  { id: 'other', label: 'Sonstiges', color: '#aaaaaa', on: false },
];

// [Regex, Kategorie, Bezeichnung] – erste passende Regel gewinnt.
const RULES = [
  [/^StartTemple$/, 'boss', 'Startpunkt (Opfersteine)'],
  [/^Eikthyrnir$/, 'boss', 'Eikthyr'],
  [/^GDKing$/, 'boss', 'Der Älteste'],
  [/^Bonemass$/, 'boss', 'Knochenmasse'],
  [/^Dragonqueen$/, 'boss', 'Moder'],
  [/^GoblinKing$/, 'boss', 'Yagluth'],
  [/^Mistlands_DvergrBossEntrance/, 'boss', 'Die Königin'],
  [/^FaderLocation$/, 'boss', 'Fader'],
  [/^DN_Bossroom$/, 'boss', 'Boss des Tiefen Nordens'],

  [/^Vendor_BlackForest$/, 'vendor', 'Haldor (Händler)'],
  [/^Hildir_camp$/, 'vendor', 'Hildir (Händlerin)'],
  [/^BogWitch_Camp$/, 'vendor', 'Moorhexe (Händlerin)'],
  [/^Hildir_crypt$/, 'vendor', 'Hildir-Quest: Schwelendes Grab'],
  [/^Hildir_cave$/, 'vendor', 'Hildir-Quest: Heulende Höhle'],
  [/^Hildir_plainsfortress$/, 'vendor', 'Hildir-Quest: Versiegelter Turm'],

  [/^Crypt\d/, 'dungeon', 'Grabkammer (Schwarzwald)'],
  [/^SunkenCrypt/, 'dungeon', 'Versunkene Krypta'],
  [/^TrollCave/, 'dungeon', 'Trollhöhle'],
  [/^MountainCave/, 'dungeon', 'Frosthöhle'],
  [/^Mistlands_DvergrTownEntrance/, 'dungeon', 'Verseuchte Mine'],
  [/^GoblinCamp/, 'dungeon', 'Fuling-Dorf'],
  [/^CharredFortress$/, 'dungeon', 'Verkohlte Festung'],
  [/^MorgenHole/, 'dungeon', 'Fauliges Loch (Morgen)'],
  [/^BearCave$/, 'dungeon', 'Bärenhöhle'],
  [/^TheHole/, 'dungeon', 'Das Loch'],
  [/^MorkBorg$/, 'dungeon', 'Mörk Borg'],

  [/^TarPit/, 'resource', 'Teergrube'],
  [/^DrakeNest/, 'resource', 'Drachennest (Ei)'],
  [/^InfestedTree/, 'resource', 'Befallener Baum (Guck)'],
  [/^Mistlands_Giant/, 'resource', 'Jotun-Überreste'],
  [/^Mistlands_Excavation/, 'resource', 'Dvergr-Ausgrabung'],
  [/^Mistlands_Swords/, 'resource', 'Riesenschwerter'],
  [/^LeviathanLava$/, 'resource', 'Lava-Leviathan'],
  [/^FireHole$/, 'resource', 'Surtling-Geysir'],
  [/^SulfurArch$/, 'resource', 'Schwefelbogen'],
  [/^VoltureNest$/, 'resource', 'Geiernest'],
  [/^AncientUpgradeStation$/, 'resource', 'Antike Werkstation'],
  [/^BigRockClearing$/, 'resource', 'Lichtung mit Felsen'],

  [/^Runestone_Meadows$/, 'lore', 'Runenstein (Wiesen)'],
  [/^Runestone_Boars$/, 'lore', 'Runenstein (Eber)'],
  [/^Runestone_BlackForest$/, 'lore', 'Runenstein (Schwarzwald)'],
  [/^Runestone_Greydwarfs$/, 'lore', 'Runenstein (Grauzwerge)'],
  [/^Runestone_Swamps$/, 'lore', 'Runenstein (Sumpf)'],
  [/^Runestone_Draugr$/, 'lore', 'Runenstein (Draugr)'],
  [/^Runestone_Mountains$/, 'lore', 'Runenstein (Berge)'],
  [/^Runestone_Plains$/, 'lore', 'Runenstein (Ebenen)'],
  [/^Runestone_Mistlands$/, 'lore', 'Runenstein (Nebellande)'],
  [/^Runestone_Ashlands$/, 'lore', 'Runenstein (Aschelande)'],
  [/^Runestone_DeepNorth$/, 'lore', 'Runenstein (Tiefer Norden)'],
  [/^DrakeLorestone$/, 'lore', 'Drachen-Lorestein'],
  [/^PlaceofMystery/, 'lore', 'Ort der Mysterien'],
  [/^NorthMemorialPlace$/, 'lore', 'Gedenkstätte (Norden)'],

  [/^WoodHouse/, 'meadows', 'Verlassenes Holzhaus'],
  [/^WoodFarm/, 'meadows', 'Verlassener Hof'],
  [/^WoodVillage/, 'meadows', 'Draugr-Dorf'],
  [/^ShipSetting/, 'meadows', 'Schiffssetzung (Grab)'],
  [/^StoneCircle$/, 'meadows', 'Steinkreis'],
  [/^Dolmen/, 'meadows', 'Dolmen'],

  [/^Greydwarf_camp/, 'forest', 'Grauzwerg-Nest'],
  [/^StoneTowerRuins.*_sunk$/, 'forest', 'Versunkene Turmruine'],
  [/^StoneTowerRuins/, 'forest', 'Turmruine'],
  [/^StoneHouse/, 'forest', 'Steinhaus-Ruine'],
  [/^Ruin\d/, 'forest', 'Ruine'],

  [/^SwampHut/, 'swamp', 'Sumpfhütte'],
  [/^SwampRuin/, 'swamp', 'Sumpfruine (Turm)'],
  [/^SwampWell/, 'swamp', 'Sumpfbrunnen'],
  [/^Grave1$/, 'swamp', 'Gräberfeld'],

  [/^StoneTower\d/, 'mountain', 'Steinturm (Berge)'],
  [/^MountainGrave/, 'mountain', 'Berggrab'],
  [/^MountainWell/, 'mountain', 'Bergbrunnen'],
  [/^AbandonedLogCabin/, 'mountain', 'Verlassene Blockhütte'],
  [/^Waymarker/, 'mountain', 'Wegmarke (Steinmann)'],

  [/^GoblinHut/, 'plains', 'Fuling-Hütte'],
  [/^StoneHenge/, 'plains', 'Stonehenge'],
  [/^LumberCamp$/, 'plains', 'Holzfällerlager'],

  [/^ShipWreck\d+$/, 'ocean', 'Schiffswrack'],

  [/^Mistlands_GuardTower.*ruined/, 'mistlands', 'Dvergr-Wachturm (Ruine)'],
  [/^Mistlands_GuardTower/, 'mistlands', 'Dvergr-Wachturm'],
  [/^Mistlands_Harbour/, 'mistlands', 'Dvergr-Hafen'],
  [/^Mistlands_Lighthouse/, 'mistlands', 'Dvergr-Leuchtturm'],
  [/^Mistlands_Viaduct/, 'mistlands', 'Viadukt'],
  [/^Mistlands_RoadPost/, 'mistlands', 'Wegpfosten'],
  [/^Mistlands_RockSpire/, 'mistlands', 'Felsnadel'],
  [/^Mistlands_Statue/, 'mistlands', 'Statue'],

  [/^CharredRuins/, 'ashlands', 'Verkohlte Ruine'],
  [/^CharredTowerRuins/, 'ashlands', 'Verkohlte Turmruine'],
  [/^CharredStone_Spawner$/, 'ashlands', 'Verkohlten-Spawner (Monolith)'],
  [/^AshlandRuins$/, 'ashlands', 'Aschelande-Ruine'],
  [/^FortressRuins$/, 'ashlands', 'Festungsruine'],

  [/^ShipWreck\d+_DN$/, 'deepnorth', 'Schiffswrack (Norden)'],
  [/^FrozenShip/, 'deepnorth', 'Eingefrorenes Schiff'],
  [/^NorthVillage$/, 'deepnorth', 'Dorf des Nordens'],
  [/^DN_gammeltroll/, 'deepnorth', 'Gammeltroll-Felsen'],
  [/^DN_hut/, 'deepnorth', 'Hütte (Norden)'],
  [/^IcePond/, 'deepnorth', 'Eisteich'],
  [/^CombatRuin/, 'deepnorth', 'Kampfruine'],
  [/^DN_/, 'deepnorth', 'Tiefer Norden (sonstiges)'],
];

// Alle bekannten Prefab-Namen (zum Auflösen der Hashes aus Spielständen).
export const KNOWN_PREFABS = ['AbandonedLogCabin02', 'AbandonedLogCabin03', 'AbandonedLogCabin04',
  'AncientUpgradeStation', 'AshlandRuins', 'BearCave', 'BigRockClearing', 'BogWitch_Camp', 'Bonemass',
  'CharredFortress', 'CharredRuins1', 'CharredRuins2', 'CharredRuins3', 'CharredRuins4', 'CharredStone_Spawner',
  'CharredTowerRuins1', 'CharredTowerRuins1_dvergr', 'CharredTowerRuins2', 'CharredTowerRuins3', 'CombatRuin01',
  'Crypt2', 'Crypt3', 'Crypt4', 'DN_Bossroom', 'DN_gammeltrollFrac01', 'DN_gammeltrollFrac02', 'DN_hut01',
  'Dolmen01', 'Dolmen02', 'Dolmen03', 'Dragonqueen', 'DrakeLorestone', 'DrakeNest01', 'Eikthyrnir',
  'FaderLocation', 'FireHole', 'FortressRuins', 'FrozenShip01_DN', 'FrozenShip02_DN', 'FrozenShip03_DN',
  'GDKing', 'GoblinCamp2', 'GoblinHut01', 'GoblinHut02', 'GoblinHut03', 'GoblinKing', 'Grave1',
  'Greydwarf_camp1', 'Hildir_camp', 'Hildir_cave', 'Hildir_crypt', 'Hildir_plainsfortress', 'IcePond1',
  'InfestedTree01', 'LeviathanLava', 'LumberCamp', 'Mistlands_DvergrBossEntrance1',
  'Mistlands_DvergrTownEntrance1', 'Mistlands_DvergrTownEntrance2', 'Mistlands_Excavation1',
  'Mistlands_Excavation2', 'Mistlands_Excavation3', 'Mistlands_Giant1', 'Mistlands_Giant2',
  'Mistlands_GuardTower1_new', 'Mistlands_GuardTower1_ruined_new', 'Mistlands_GuardTower1_ruined_new2',
  'Mistlands_GuardTower2_new', 'Mistlands_GuardTower3_new', 'Mistlands_GuardTower3_ruined_new',
  'Mistlands_Harbour1', 'Mistlands_Lighthouse1_new', 'Mistlands_RoadPost1', 'Mistlands_RockSpire1',
  'Mistlands_Statue1', 'Mistlands_Statue2', 'Mistlands_StatueGroup1', 'Mistlands_Swords1', 'Mistlands_Swords2',
  'Mistlands_Swords3', 'Mistlands_Viaduct1', 'Mistlands_Viaduct2', 'MorgenHole1', 'MorgenHole2', 'MorgenHole3',
  'MorkBorg', 'MountainCave02', 'MountainGrave01', 'MountainWell1', 'NorthMemorialPlace', 'NorthVillage',
  'PlaceofMystery1', 'PlaceofMystery2', 'PlaceofMystery3', 'Ruin1', 'Ruin2', 'Ruin3', 'Runestone_Ashlands',
  'Runestone_BlackForest', 'Runestone_Boars', 'Runestone_DeepNorth', 'Runestone_Draugr', 'Runestone_Greydwarfs',
  'Runestone_Meadows', 'Runestone_Mistlands', 'Runestone_Mountains', 'Runestone_Plains', 'Runestone_Swamps',
  'ShipSetting01', 'ShipSetting02', 'ShipSetting03', 'ShipWreck01', 'ShipWreck01_DN', 'ShipWreck02',
  'ShipWreck02_DN', 'ShipWreck03', 'ShipWreck04', 'StartTemple', 'StoneCircle', 'StoneHenge1', 'StoneHenge2',
  'StoneHenge3', 'StoneHenge4', 'StoneHenge5', 'StoneHenge6', 'StoneHouse3', 'StoneHouse4', 'StoneTower1',
  'StoneTower3', 'StoneTowerRuins03', 'StoneTowerRuins04', 'StoneTowerRuins05', 'StoneTowerRuins05_leet',
  'StoneTowerRuins07', 'StoneTowerRuins07_sunk', 'StoneTowerRuins08', 'StoneTowerRuins08_sunk',
  'StoneTowerRuins09', 'StoneTowerRuins09_sunk', 'StoneTowerRuins10', 'StoneTowerRuins10_sunk', 'SulfurArch',
  'SunkenCrypt4', 'SwampHut1', 'SwampHut1_1', 'SwampHut2', 'SwampHut2_1', 'SwampHut3', 'SwampHut3_1',
  'SwampHut4', 'SwampHut5', 'SwampRuin1', 'SwampRuin2', 'SwampWell1', 'TarPit1', 'TarPit2', 'TarPit3',
  'TheHole01', 'TrollCave02', 'Vendor_BlackForest', 'VoltureNest', 'Waymarker01', 'Waymarker02', 'WoodFarm1',
  'WoodHouse1', 'WoodHouse10', 'WoodHouse11', 'WoodHouse12', 'WoodHouse13', 'WoodHouse2', 'WoodHouse3',
  'WoodHouse4', 'WoodHouse5', 'WoodHouse6', 'WoodHouse7', 'WoodHouse8', 'WoodHouse9', 'WoodVillage1',
  'WoodVillage2'];

const HASH_TO_NAME = new Map(KNOWN_PREFABS.map(n => [stableHash(n), n]));

export function prefabFromHash(hash) {
  return HASH_TO_NAME.get(hash) || `#${hash}`;
}

const cache = new Map();
/** @returns {{cat: string, label: string}} */
export function classify(prefab) {
  let r = cache.get(prefab);
  if (!r) {
    r = { cat: 'other', label: prefab };
    for (const [re, cat, label] of RULES) {
      if (re.test(prefab)) { r = { cat, label }; break; }
    }
    cache.set(prefab, r);
  }
  return r;
}
