import type { InsulationId, OuterJacketId } from './catalog'

/**
 * The estimator data card: standards, moisture behaviour, application tags and
 * jacket notes per material. Distilled from research/materials-verified.json
 * (product sheets named inline); jacket rows also use research/jackets-verified.json.
 * Keep every line traceable to those files.
 */

export interface Standard { code: string; note: string }

export interface Card {
  standards: Standard[]
  moisture: string[]
  tags: string[]
  /** Jacket notes specific to this material, keyed by outer jacket or 'asj' facing. */
  jacketNotes: Partial<Record<OuterJacketId | 'asj', string>>
}

export const CARD: Record<InsulationId, Card> = {
  fiberglass: {
    standards: [
      { code: 'C547 Type I', note: 'Mineral fiber pipe insulation, to 850°F' },
      { code: 'C585', note: 'Inner and outer diameters' },
      { code: 'C1136', note: 'ASJ jacket (vapor retarder)' },
      { code: 'C795', note: 'Over austenitic stainless; lot certification on order' },
      { code: 'E84 25/50', note: 'Jacketed, composite' },
      { code: 'UL BSMP', note: 'Listed over plastic pipe in plenums at 1" and up' },
    ],
    moisture: [
      'Core is not a vapor retarder; water vapor sorption <5% by weight (ASTM C1104).',
      'ASJ: 0.02 perm max (JM), ASJ Max 0.01 perm (OC), ASTM E96 Proc. A.',
      'Below ambient (OC: under 100°F) every lap, butt strip and fitting is sealed for a continuous vapor seal.',
    ],
    tags: ['Steam', 'Condensate', 'Heating hot water', 'Domestic hot water', 'Chilled water', 'Refrigerant', 'Plastic pipe in plenums'],
    jacketNotes: {
      none: 'ASJ finish indoors only; OC says ASJ Max is not for long-term outdoor use.',
      pvc: 'JM: Zeston PVC used for abuse, chilled water and USDA/FDA areas.',
      'alu-smooth': 'Outdoors a weather-protective jacket is required (OC, JM).',
    },
  },
  'mineral-wool': {
    standards: [
      { code: 'C547 Types I, II, IV', note: 'Grade A (both data sheets)' },
      { code: 'C795', note: 'Passes, over austenitic stainless' },
      { code: 'C447', note: 'Max service temperature 1200°F (JM)' },
      { code: 'C585', note: 'Dimensions (JM)' },
      { code: 'E84 0/0', note: 'Flame spread / smoke developed' },
      { code: 'ISO 1182', note: 'Non-combustible (JM); IMO FTPC (ROCKWOOL)' },
    ],
    moisture: [
      'Not a vapor retarder; water-repellent binder (ROCKWOOL WR-Tech, JM WR).',
      'Water vapor sorption <1% by weight (ASTM C1104).',
      'Below ambient it needs a separately installed vapor retarder (ASTM C547 §1.2); both makers position it for hot service.',
    ],
    tags: ['Steam', 'High-temp process', 'Power', 'Oil & gas', 'Chemical (CUI)', 'Acoustic lagging'],
    jacketNotes: {
      'alu-smooth': 'JM guide spec: metal jacketing is required for exterior applications and corrosive environments.',
      pvc: 'JM guide spec: Zeston UV-resistant PVC may replace metal within its limits.',
      none: 'Ships unfaced; must be field jacketed.',
    },
  },
  calsil: {
    standards: [
      { code: 'C533 Type I', note: 'Calcium silicate block and pipe' },
      { code: 'C795', note: 'Passes, over austenitic stainless' },
      { code: 'E136', note: 'Noncombustible' },
      { code: 'E84 0/0', note: 'Flame spread / smoke developed' },
      { code: 'C165', note: '>100 psi at 5% compression' },
      { code: 'C585', note: 'Dimensions (JM guide spec)' },
    ],
    moisture: [
      'No vapor permeance published; a hot-service material.',
      'Absorbs water: typical calsil up to 80% of its weight in 20 min of simulated rain; Thermo-1200 under 15% (JM).',
      'Not hydrophobic, and its water repellency dissipates from about 450°F: jacket as soon as feasible (JM).',
    ],
    tags: ['Steam', 'High-temp process', 'Power', 'Refining', 'Valves & fittings', 'Tanks & vessels', 'Abuse areas'],
    jacketNotes: {
      'alu-smooth': 'JM guide spec: 0.016" T-3003 H-14 with moisture barrier; required for exterior and corrosive areas.',
      ss: 'JM guide spec: 0.010" Type 304, with or without moisture barrier.',
      none: 'Must be weather protected before, during and after installation (JM).',
    },
  },
  'cellular-glass': {
    standards: [
      { code: 'C552 Grade 6', note: 'Type I block (FOAMGLAS ONE)' },
      { code: 'C1639', note: 'Fabrication of pipe covering from block' },
      { code: 'C795', note: 'With C692 / C871: stainless OK' },
      { code: 'E136', note: 'Noncombustible' },
      { code: 'E84 0/0', note: 'Flame spread / smoke developed' },
      { code: 'E96', note: '0.00 perm·in (wet cup)' },
    ],
    moisture: [
      'Impermeable: 0.00 perm·in (ASTM E96 wet cup); absorption <0.2% by volume; no wicking (OC).',
      'Joints are the vapor path: seal them (PITTSEAL 444NS) and add a vapor-retarder coating or jacket on cold lines (OC).',
      'Stress cracks are possible if temperature changes faster than 200°F per hour (ASTM C552).',
    ],
    tags: ['Cryogenic / LNG', 'Chilled water', 'Dual-temp', 'Steam & hot oil', 'Tanks & vessels', 'Direct buried', 'Load-bearing supports'],
    jacketNotes: {
      none: 'OC system jackets: PITTWRAP (above or below ambient, buried) or PITTCOTE 300E coating.',
      'alu-smooth': 'OC: metal jacketing over PITTWRAP IW30 for hot service.',
    },
  },
  elastomeric: {
    standards: [
      { code: 'C534 Type I Gr. 1', note: 'Flexible elastomeric cellular insulation' },
      { code: 'E84 25/50', note: 'Tube walls through 2"' },
      { code: 'E96', note: '0.05 perm·in (AP ArmaFlex, ≤1" walls)' },
      { code: 'C209', note: 'Water absorption 0.2% by volume (AP)' },
      { code: 'D1056', note: 'Flexible cellular material grade' },
    ],
    moisture: [
      'Closed cell with a built-in vapor retarder: 0.05 perm·in (AP ArmaFlex), <0.01 perm·in (K-FLEX Insul-Tube).',
      'Every seam and butt joint glued; on cold lines ends are glued to the pipe every 18 ft (Armacell).',
      'Extra vapor retarder may be needed on very cold lines or in continuous high humidity (K-FLEX).',
    ],
    tags: ['Refrigerant / VRF', 'Chilled water', 'Cold water', 'Hot water (to 220°F)', 'Dual-temp', 'Solar thermal', 'Outdoor linesets'],
    jacketNotes: {
      none: 'Indoors bare. Outdoors: paint (two coats of WB Finish) or clad for UV (Armacell); TITAN has a factory UV jacket (K-FLEX).',
    },
  },
  phenolic: {
    standards: [
      { code: 'C1126 Types II, III', note: 'Grade 1 (Resolco)' },
      { code: 'C795', note: 'Pass, over austenitic stainless' },
      { code: 'C450 / C585', note: 'Fabrication from bun stock' },
      { code: 'E84 25/50', note: 'Faced and unfaced, 1" to 3"' },
      { code: 'C209', note: 'Water absorption 0.61% by volume' },
    ],
    moisture: [
      'Closed cell (minimum 92%, ASTM D6226); water absorption 0.61% by volume (ASTM C209).',
      'Foam permeability is not published; the factory ASJ or zero-perm Venture jacket is the vapor barrier (Resolco).',
      'ASTM C1126: below −40°F it needs a vapor retarder on the warm surface.',
    ],
    tags: ['Chilled water', 'Below ambient', 'Heating hot water', 'Hospitals & schools', 'Food & pharma', 'Pipe supports'],
    jacketNotes: {
      none: 'Factory ASJ finish indoors.',
      pvc: 'Resolco: indoors 0.030" UV-resistant PVC (0.040" or double in abuse areas); CPVC (Proto EXOD, +225°F) for hot washdown.',
      'alu-smooth': 'Resolco: outdoors over Polyguard Insulrap 30; 0.016" min, 0.024" where abuse or vertical equipment.',
    },
  },
}
