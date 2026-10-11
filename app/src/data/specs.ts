// Pipe insulation specs distilled from research/materials-verified.json (generated 2026-10-10).
// Every number traces to that dataset; source ids (S1, S2, ...) are the dataset's own ids and are
// scoped per material. Values the dataset marks "unverified" are omitted or listed in `gaps`.
// Manufacturer values are typical/nominal; confirm against the current sheet before a submittal.

import { SPECS2 } from './specs2'

export interface Source { id: string; label: string; url: string }
export interface KPoint { meanF: number; k: number } // Btu·in/(hr·ft²·°F), ASTM C335 unless noted
export interface ProductSpec {
  name: string            // short, e.g. "Johns Manville Thermo-1200"
  tempF: { min: number | null; max: number | null; note?: string }
  k: KPoint[]             // only points actually published; [] if none
  kNote?: string          // e.g. "no mean temperature printed"
  density?: string        // as published, with units, e.g. "8 pcf nominal"
  compressive?: string    // as published
  e84?: string            // e.g. "25/50" with any thickness limit
  vapor?: string          // permeability as published
  combustibility?: string // e.g. "Noncombustible per ASTM E136"
  sources: string[]       // Source ids used by this product
}
export interface MaterialSpec {
  id: 'fiberglass' | 'mineral-wool' | 'calsil' | 'cellular-glass' | 'elastomeric' | 'phenolic' | 'pir' | 'aerogel' | 'perlite' | 'polyolefin'
  name: string            // e.g. "Calcium Silicate"
  astm: string            // e.g. "ASTM C533 Type I"
  summary: string         // 1–2 plain sentences an estimator would find useful
  applications: string[]  // 3–6 short service descriptions, grounded in the data
  pros: string[]          // 2–4, grounded in the data
  cons: string[]          // 2–4, grounded in the data
  sizes: string           // pipe sizes / thickness ranges / section length as published, or "Not published by sources reviewed"
  products: ProductSpec[] // 1–2 products, as in the dataset
  gaps: string[]          // short notes on what is unverified or conflicting (for a footnote)
  sources: Source[]       // only sources referenced by this material's entries; label = manufacturer + doc title + pub/date
}

const SPECS1: Record<Exclude<MaterialSpec['id'], keyof typeof SPECS2>, MaterialSpec> = {
  fiberglass: {
    id: 'fiberglass',
    name: "Fiberglass",
    astm: "ASTM C547 Type I",
    summary: "Glass-fiber pipe insulation in one-piece 36 in. hinged sections with a factory all-service jacket (ASJ) and self-sealing lap. ASTM C547 Type I is rated to 850°F, and on cold lines the insulation only works if the vapor jacket is sealed at every joint.",
    applications: [
      "Hot and cold, concealed and exposed commercial, power and process piping (JM to 850°F; OC to 1,000°F)",
      "Steam, steam condensate, heating hot water and domestic hot water",
      "Cold and chilled water, brine and refrigerant lines, with joints sealed and thickness set to prevent condensation",
      "PVC, CPVC and polypropylene pipe in return-air plenums (UL listed at 1 in. or thicker)",
    ],
    pros: [
      "k 0.23 at 75°F mean for both products",
      "Factory ASJ with self-sealing lap and butt strips; no staples or mastic needed",
      "Composite flame spread 25 / smoke developed 50; UL listed over plastic pipe in plenums at 1 in. or thicker",
      "Light (3.5–5.5 pcf, OC); both makers offer IPS 1/2–24 in. and copper 5/8–6-1/8 in. OD",
    ],
    cons: [
      "C547 Type I is rated to 850°F; OC reaches 1,000°F only with a heat-up schedule, and JM stops at 850°F",
      "Binder burns off above 350°F on first heat-up, causing odor and smoke and lowering compressive strength and resiliency (JM)",
      "ASJ surface is limited to 150°F and is not for long-term outdoor use, so outdoor runs need metal or PVC jacketing",
      "The core is not a vapor retarder; cold service depends on an unbroken vapor seal at every joint",
    ],
    sizes: "IPS 1/2–24 in. (OC to 36 in. in 1-1/2–3 in. walls); copper tube 5/8–6-1/8 in. OD; walls 1/2–5 in.; 36 in. hinged sections",
    products: [
      {
        name: "Owens Corning SSL II with ASJ Max",
        tempF: { min: 0, max: 1000, note: "850–1,000°F only with OC's heat-up schedule; ASJ Max jacket limited to 150°F" },
        k: [{ meanF: 50, k: 0.22 }, { meanF: 75, k: 0.23 }, { meanF: 100, k: 0.24 }, { meanF: 150, k: 0.27 }, { meanF: 200, k: 0.29 }, { meanF: 250, k: 0.32 }, { meanF: 300, k: 0.35 }, { meanF: 350, k: 0.39 }, { meanF: 400, k: 0.43 }, { meanF: 450, k: 0.48 }, { meanF: 500, k: 0.54 }],
        density: "3.5 to 5.5 pcf (size dependent, ASTM C302)",
        e84: "25/50 composite (UL 723 / ASTM E84); no thickness limit stated",
        vapor: "ASJ Max jacket 0.01 perm (ASTM E96 Proc. A); core not a vapor retarder",
        combustibility: "Jacketed product rated by E84 only; unjacketed No-Wrap is USCG 164.109/70/0 Non-Combustible",
        sources: ["S1", "S3", "S5"],
      },
      {
        name: "Johns Manville Micro-Lok HP",
        tempF: { min: 0, max: 850, note: "Above 500°F apply 2–6 in. thick; insulation surface must stay below 150°F" },
        k: [{ meanF: 75, k: 0.23 }, { meanF: 100, k: 0.24 }, { meanF: 200, k: 0.28 }, { meanF: 300, k: 0.34 }, { meanF: 400, k: 0.44 }, { meanF: 500, k: 0.55 }],
        e84: "25/50 composite (ASTM E84); no thickness limit stated",
        vapor: "ASJ 0.02 perms max (ASTM E96 Proc. A); HP Ultra poly-coated ASJ <0.01 perms",
        combustibility: "Limited combustibility per NFPA 90A/90B (jacketed); USCG/IMO 164.109/56/0 applies to unjacketed Plain only",
        sources: ["S8", "S9"],
      },
    ],
    gaps: [
      "Max temperature conflict: OC 1,000°F (heat-up schedule above 850°F) vs JM 850°F, though both cite C547 Type I, which OC states is 850°F max.",
      "The OC sheet pairs 650°F with 454°C (454°C = 850°F) for its 6 in. maximum-thickness rule; confirm with OC.",
      "JM publishes no nominal density for Micro-Lok HP. Neither maker publishes compressive strength or an ASTM E136 result.",
      "k differs slightly above 100°F (e.g. 400°F: OC 0.43, JM 0.44).",
    ],
    sources: [
      { id: "S1", label: "Owens Corning – Product Data Sheet – SSL II with ASJ Max Fiberglas Pipe Insulation (Pub. No. 20547-FF, July 2026)", url: "https://www.owenscorning.com/dms/20547" },
      { id: "S2", label: "Owens Corning – Owens Corning Fiberglas Pipe Insulation – Iron Pipe / Copper Tubing / Metric carton and size availability sheet (Pub. No. 10027246-B, June 2026)", url: "https://www.owenscorning.com/dms/10027246" },
      { id: "S3", label: "Owens Corning – Fiberglas Pipe Insulation Installation Instructions (Pub. No. 10021355-E, November 2025)", url: "https://www.owenscorning.com/dms/10021355" },
      { id: "S5", label: "Owens Corning – Product Data Sheet – No-Wrap Fiberglas Pipe Insulation (Pub. No. 10022794-D, August 2025)", url: "https://www.owenscorning.com/dms/10022794" },
      { id: "S7", label: "Owens Corning – Technical Bulletin – SSL II with ASJ Max Fiberglas Pipe Insulation, Listed and Labeled Plenum Insulation Rated Over Plastic Pipe Assemblies (incl. UL report SR5052164, File R14111) (Pub. No. 10023253-B, January 2026)", url: "https://www.owenscorning.com/dms/10023253" },
      { id: "S8", label: "Johns Manville – Micro-Lok HP High-Performance Fiberglass Pipe Insulation Data Sheet (MECH-228 07/31/25 (Replaces 11/08/23))", url: "https://www.jm.com/content/dam/jm/global/en/mechanical-insulation/pipe/micro-lok-hp/JM_MECH_MicroLok_HP_Data_Sheet_EN.pdf" },
      { id: "S9", label: "Johns Manville – Micro-Lok HP Plain High-Performance Fiberglass Pipe Insulation Data Sheet (MECH-252 07/31/25 (Replaces 3/18))", url: "https://www.jm.com/content/dam/jm/global/en/mechanical-insulation/pipe/micro-lok-hp-plain/JM_MECH_Micro-Lok_HP_Plain_Data_Sheet_EN.pdf" },
      { id: "S11", label: "Johns Manville – Micro-Lok HP Guidebook (eBook) (PDF created 2023-03-10 (© 2021/2023 JM))", url: "https://www.jm.com/content/dam/jm/global/en/mechanical-insulation/documents/ebooks/JM_MicroLok_HP_Guidebook_eBook.pdf" },
      { id: "S13", label: "ASTM International – ASTM C547-25 Standard Specification for Mineral Fiber Pipe Insulation (store page: abstract + scope) (C547-25 (active))", url: "https://store.astm.org/c0547-25.html" },
    ],
  },
  'mineral-wool': {
    id: 'mineral-wool',
    name: "Mineral Wool",
    astm: "ASTM C547 Types I, II, IV, Grade A",
    summary: "Mineral wool pipe sections (ROCKWOOL stone wool, JM basalt fiber) for hot piping up to 1200°F, with water-repellent binders and flame spread 0 / smoke developed 0. Ships unfaced for field jacketing and is not a vapor retarder.",
    applications: [
      "High-temperature power and process piping, 0°F to 1200°F (JM)",
      "Oil and gas and chemical process piping where corrosion under insulation (CUI) is a concern (ROCKWOOL)",
      "Steam and hot process lines up to 1200°F",
      "Acoustic pipe lagging to ISO 15665 classes",
    ],
    pros: [
      "Rated to 1200°F, above the 850°F limit of C547 Type I",
      "Flame spread 0 / smoke developed 0 (ASTM E84) and non-combustible (IMO FTPC / ISO 1182)",
      "Water-repellent binders (WR-Tech, JM WR) aimed at reducing CUI risk",
      "Both pass ASTM C795 for use over austenitic stainless steel",
    ],
    cons: [
      "Not a vapor retarder; below-ambient service needs a separately installed vapor retarder",
      "Ships unfaced and must be field-jacketed; JM requires metal jacketing outdoors and in corrosive areas",
      "Double layers needed at higher temperature or thickness: JM at ≥600°F or >3 in.; ROCKWOOL at >550°F or >5 in.",
      "Generally heavier than fiberglass (NIA)",
    ],
    sizes: "JM: NPS 1/2–6 in. one piece, 7–24 in. two piece, 25–44 in. four piece; 1–6 in. thick in 1/2 in. steps; 36 in. lengths. ROCKWOOL: 1–32 in. inner diameter, 1–5 in. thick (product page). Copper tube sizes not published.",
    products: [
      {
        name: "ROCKWOOL ProRox PS 960NA (WR-Tech)",
        tempF: { min: null, max: 1200, note: "No minimum published; two layers above 550°F or over 5 in. thick (Process Manual)" },
        k: [{ meanF: 100, k: 0.25 }, { meanF: 200, k: 0.29 }, { meanF: 300, k: 0.35 }, { meanF: 400, k: 0.4 }, { meanF: 500, k: 0.47 }, { meanF: 600, k: 0.56 }, { meanF: 700, k: 0.63 }],
        kNote: "No 75°F value published",
        density: "8 pcf nominal (actual >6.2 pcf), ASTM C302",
        e84: "0/0 (ASTM E84 / UL 723)",
        combustibility: "Non-combustible per IMO 2010 FTPC",
        sources: ["S1", "S2", "S3"],
      },
      {
        name: "Johns Manville MinWool-1200 Pipe",
        tempF: { min: 0, max: 1200, note: "Double layer at or above 600°F or over 3 in. thick (guide spec)" },
        k: [{ meanF: 75, k: 0.22 }, { meanF: 100, k: 0.23 }, { meanF: 200, k: 0.28 }, { meanF: 300, k: 0.34 }, { meanF: 400, k: 0.4 }, { meanF: 500, k: 0.48 }, { meanF: 600, k: 0.56 }, { meanF: 700, k: 0.66 }],
        e84: "0/0 (ASTM E84, UL 723)",
        combustibility: "Non-combustible per ISO 1182",
        sources: ["S5", "S6"],
      },
    ],
    gaps: [
      "C547 types: both data sheets claim Types I, II, IV Grade A; JM's guide spec IND-504 lists only Types I and II.",
      "k differs at 100°F (ROCKWOOL 0.25, JM 0.23) and 700°F (0.63 vs 0.66).",
      "ROCKWOOL size range conflicts: product page 1–32 in. ID vs 2019 Process Manual NPS 1/2–36 in.; North American section length not published.",
      "Not published: MinWool-1200 Pipe density, PS 960NA minimum temperature, ASTM E96 permeability, and an ASTM E136 result for either product.",
    ],
    sources: [
      { id: "S1", label: "ROCKWOOL Technical Insulation – ProRox PS 960NA with WR-Tech, product data sheet (ASTM) (PDS No: PAA-00-0-001-ENG, Issued 31-05-2024, Supersedes 05-10-2017)", url: "https://rti.rockwool.com/siteassets/tools--documentation/products-industrial/product-data-sheets/astm/rw-ti-pds-prorox-ps-960-na-astm_en.pdf" },
      { id: "S2", label: "ROCKWOOL Technical Insulation – ProRox PS 960 NA product page (live page, accessed 2026-10-10)", url: "https://rti.rockwool.com/en/products/prorox-ps-960-na" },
      { id: "S3", label: "ROCKWOOL Technical Insulation – ProRox Process Manual: Technical guidelines for the insulation of industrial installations (PDF created 2019-02-22; imperial-unit edition with 'Products: North America' section)", url: "https://brandportal.rockwool.com/original/gallery/39052/files/original/1b2669ae-5dd9-4d17-b81e-2d61bc15287c.pdf" },
      { id: "S5", label: "Johns Manville – MinWool-1200 Pipe data sheet (water-repellent) (IND-401 12/12/24 (Replaces 11/06/23))", url: "https://www.jm.com/content/dam/jm/global/en/industrial-insulation/industrial-mineral-wool/minwool-1200-pipe/JM_IND_WR_MinWool_1200_Pipe_DS.pdf" },
      { id: "S6", label: "Johns Manville – MinWool-1200 High-Temperature Pipe & Acoustical Insulation, I-SPEC CSI 3-part guide specification (IND-504 03/30/26 (Replaces 1/19/26))", url: "https://www.jm.com/content/dam/jm/global/en/insulation-systems/products/assets/codes-approval/ind-504-guide-spec-minwool-pipe.pdf" },
      { id: "S10", label: "ASTM International – ASTM C547-25 Standard Specification for Mineral Fiber Pipe Insulation (abstract and scope) (C547-25 (active))", url: "https://store.astm.org/c0547-25.html" },
      { id: "S11", label: "National Insulation Association – Insulation Materials Specification Chart from NIA (NIA-TIC-101-4/24, Copyright 2024)", url: "https://insulation.org/wp-content/uploads/2024/04/NIA-Spec-Chart-April-2024.pdf" },
    ],
  },
  calsil: {
    id: 'calsil',
    name: "Calcium Silicate",
    astm: "ASTM C533 Type I",
    summary: "Rigid, cementitious pipe and block insulation for hot piping and equipment up to 1200°F. Strong (over 100 psi compressive) and noncombustible, but heavy, and it must be jacketed to keep water out.",
    applications: [
      "Hot pipe and equipment in chemical processing, power generation and petroleum refining, ambient to 1200°F",
      "Steam piping, valves and fittings, tanks, vessels, heat exchangers and boilers above 250°F",
      "Areas where mechanical abuse is likely",
      "Large pipe and vessels using quad segments, curved segments, scored block and beveled lags",
      "Austenitic stainless steel piping (passes ASTM C795)",
    ],
    pros: [
      "Compressive strength over 100 psi at 5% compression (ASTM C165)",
      "Noncombustible (ASTM E136); flame spread 0 / smoke developed 0",
      "Inorganic binder, so no binder burnout; under 2% linear shrinkage after 24 hr at 1200°F",
      "Integral corrosion inhibitor; passes ASTM C795 for stainless steel",
    ],
    cons: [
      "Heavy: Thermo-1200 is under 15 pcf; e.g. NPS 12 × 3 in. weighs 18 lb per linear ft (JM IND-310)",
      "Absorbs water: standard calsil takes up as much as 80% of its weight in 20 min of simulated rain (Thermo-1200 under 15%), so jacket promptly",
      "Relatively high k: 0.344 at 100°F rising to 0.647 at 700°F (pipe)",
      "Hot service only; fittings are field-fabricated, and double layers are needed at ≥600°F or over 3 in.",
    ],
    sizes: "NPS 1/2–24 in. half-sections; quad segments 20–37 in.; hex covering 38–52 in. (Ruston plant only); curved segments and curved radius block 30–126 in.; beveled lags 127 in. and up. Single layer 1–3 in. (1 in. only to NPS 6); nested double layer 3–6 in. in 1/2 in. steps; 36 in. lengths. No copper tube sizes.",
    products: [
      {
        name: "Johns Manville Thermo-1200",
        tempF: { min: null, max: 1200, note: "Ambient to 1200°F; no numeric minimum (guide spec covers 120–1200°F systems)" },
        k: [{ meanF: 100, k: 0.344 }, { meanF: 200, k: 0.389 }, { meanF: 300, k: 0.437 }, { meanF: 400, k: 0.486 }, { meanF: 500, k: 0.538 }, { meanF: 600, k: 0.591 }, { meanF: 700, k: 0.647 }],
        kNote: "Pipe values (ASTM C335); flat block (C518) values are printed separately",
        density: "<15 pcf dry average (ASTM C302)",
        compressive: ">100 psi at 5% compression (ASTM C165)",
        e84: "0/0 (ASTM E84, UL 723)",
        combustibility: "Noncombustible per ASTM E136",
        sources: ["S1", "S2"],
      },
      {
        name: "IIG Thermo-12 Gold (discontinued; replaced by Thermo-1200)",
        tempF: { min: null, max: 1200, note: "No minimum stated" },
        k: [{ meanF: 100, k: 0.344 }, { meanF: 200, k: 0.389 }, { meanF: 300, k: 0.437 }, { meanF: 400, k: 0.486 }, { meanF: 500, k: 0.538 }, { meanF: 600, k: 0.591 }, { meanF: 700, k: 0.647 }],
        kNote: "Pipe values from IND-300 12-16 (same as Thermo-1200); the 2008 IIG-300 sheet printed a higher curve",
        density: ">14 pcf as printed (IND-300 12-16); 14.5 pcf on the 2008 sheet",
        compressive: ">100 psi at 5% compression (ASTM C165)",
        e84: "0/0 (ASTM E84, NFPA 255, UL 723)",
        combustibility: "Noncombustible per ASTM E136",
        sources: ["S3", "S9", "S10"],
      },
    ],
    gaps: [
      "Thermo-12 Gold is discontinued; JM replaced it with Thermo-1200 starting in 2017 (FAQ IND-305), so specs naming it are filled with Thermo-1200.",
      "Density as printed: Thermo-1200 <15 pcf; Thermo-12 Gold >14 pcf (2016 sheet) and 14.5 pcf (2008 sheet).",
      "The 2008 Thermo-12 Gold sheet printed a higher k curve (e.g. 0.41 vs 0.389 at 200°F).",
      "Neither product publishes k at 75°F or a water vapor permeability.",
      "C533 Type IA and Type II temperature limits are not on the public ASTM page.",
    ],
    sources: [
      { id: "S1", label: "Johns Manville – Thermo-1200 Calcium Silicate Pipe & Block Insulation — Data Sheet (IND-303 04/08/25 (Replaces 02/28/24))", url: "https://www.jm.com/content/dam/jm/global/en/industrial-insulation/calcium-silicate/thermo-1200/JM_IND_Thermo-1200_DS.pdf" },
      { id: "S2", label: "Johns Manville – Thermo-1200 Calcium Silicate Pipe & Block Insulation — I-SPEC CSI 3-Part Guide Specification (IND-502 09/19/25 (Replaces 04/08/25))", url: "https://www.jm.com/content/dam/jm/global/en/industrial-insulation/calcium-silicate/thermo-1200/JM_IND_Thermo-1200_Guide_Spec.pdf" },
      { id: "S3", label: "Johns Manville – Thermo-1200 Frequently Asked Questions — Water Resistant Calcium Silicate (IND-305 01/09/19 (Replaces 06/16/17))", url: "https://www.jm.com/content/dam/jm/global/en/industrial-insulation/calcium-silicate/thermo-1200/JM_IND_Thermo-1200_FAQ.pdf" },
      { id: "S4", label: "Johns Manville – JM Industrial Product Selector Guide (no form number printed; PDF metadata created 2025-09-26)", url: "https://www.jm.com/content/dam/jm/global/en/industrial-insulation/Industrial%20Documents/JM_Industrial_Product_Selector_Guide.pdf" },
      { id: "S5", label: "Johns Manville – Thermo-1200 Calcium Silicate Pipe & Block Insulation — Packaging & Shipping Data (IND-CS-4 04/23/25 (Replaces 09/21/22))", url: "https://www.jm.com/content/dam/jm/global/en/industrial-insulation/calcium-silicate/thermo-1200/IND_T1200_Packaging_Shipping_Data.pdf" },
      { id: "S6", label: "Johns Manville – Thermo-1200 Calcium Silicate Pipe & Block Insulation — Linear Foot Chart (pounds per linear foot) (IND-310 05-17 (Replaces 01-15))", url: "https://www.jm.com/content/dam/jm/global/en/industrial-insulation/calcium-silicate/thermo-1200/IND-310-Thermo1200-Pounds-Per-Linear-Foot-Chart.pdf" },
      { id: "S9", label: "Industrial Insulation Group, LLC (hosted on jm.com) – Thermo-12 Gold Pipe and Block Insulation — Product Data Sheet (IND-300 12-16 (Replaces IND-300 01-16); ©2016 Industrial Insulation Group, LLC)", url: "https://www.jm.com/content/dam/jm/global/en/industrial-insulation/calcium-silicate/thermo-12-gold/IND-300-Thermo-12-Gold.pdf" },
      { id: "S10", label: "Industrial Insulation Group, LLC (third-party host: Golmat, Israel distributor) – Thermo-12 Gold Pipe & Block Insulation (older edition) (IIG-300 3-08 (Replaces 7-07))", url: "https://www.golmat.co.il/wp-content/uploads/2022/11/%D7%A7%D7%9C%D7%A6%D7%99%D7%95%D7%9D-%D7%A1%D7%99%D7%9C%D7%99%D7%A7%D7%98-THERMO-12-GOLD-II-1.pdf" },
      { id: "S11", label: "ASTM International – ASTM C533-17(2023) Standard Specification for Calcium Silicate Block and Pipe Thermal Insulation — store page (abstract + scope) (C0533-17R23, Active, 'Last Updated: Mar 28, 2023')", url: "https://store.astm.org/c0533-17r23.html" },
      { id: "S12", label: "National Insulation Association — Insulation Outlook – Exploring Insulation Materials: Granular Insulations (2013-03-01)", url: "https://insulation.org/io/articles/exploring-insulation-materials-granular-insulations/" },
    ],
  },
  'cellular-glass': {
    id: 'cellular-glass',
    name: "Cellular Glass",
    astm: "ASTM C552 Type I (block), Grade 6",
    summary: "Rigid, closed-cell glass insulation rated from cryogenic to hot service (−450°F to 900°F for FOAMGLAS ONE). Impermeable to water vapor and noncombustible; pipe covering is fabricated from block, and joints must be sealed.",
    applications: [
      "Cryogenic systems (LNG, liquid oxygen and nitrogen) down to −450°F",
      "Below-ambient and chilled-water pipe, tanks and vessels; dual-temperature and cyclic piping",
      "Steam and heat-transfer-fluid systems; hot oil and hot asphalt tanks",
      "Hydrocarbon and chemical process piping where CUI is a concern (sealed-joint system)",
      "Direct-buried piping with PITTWRAP CW Plus, SS or HS jackets",
      "Load-bearing pipe supports and tank bases (HLB grades)",
    ],
    pros: [
      "Water vapor permeability 0.00 perm·in; moisture absorption <0.2% by volume; no wicking",
      "Noncombustible (ASTM E136); flame spread 0 / smoke developed 0",
      "Compressive strength 90 psi average (60 psi lower spec limit); HLB grades for load-bearing supports",
      "One material from −450°F to 900°F (OC rating)",
    ],
    cons: [
      "Can stress-crack if temperature changes faster than 200°F per hour (ASTM C552)",
      "Pipe covering is fabricated from block (ASTM C1639), which adds fabricator lead time, joint limits and adhesives",
      "Joints are the weak point: cold and CUI systems need joint sealant plus a vapor-retarder coating or jacket",
      "Block k is 0.29 at 75°F, and EU data show fabricated pipe sections run higher than block",
    ],
    sizes: "Pipe-covering sizes not published by sources reviewed (fabricated from block per ASTM C1639). Block: 18 × 24 in., 1.5–7 in. thick in 1/2 in. steps; large 18 × 36 in., 4–7 in. thick (data sheet).",
    products: [
      {
        name: "Owens Corning FOAMGLAS ONE",
        tempF: { min: -450, max: 900, note: "ASTM C552 scope stops at 800°F; special pipe fabrication may be needed from 250 to 800°F" },
        k: [{ meanF: -265, k: 0.14 }, { meanF: -250, k: 0.14 }, { meanF: -200, k: 0.16 }, { meanF: -150, k: 0.18 }, { meanF: -100, k: 0.2 }, { meanF: -50, k: 0.22 }, { meanF: 0, k: 0.25 }, { meanF: 50, k: 0.28 }, { meanF: 75, k: 0.29 }, { meanF: 100, k: 0.31 }, { meanF: 200, k: 0.38 }, { meanF: 300, k: 0.46 }, { meanF: 400, k: 0.54 }],
        kNote: "Typical block values (ASTM C518/C177), not pipe; none published above 400°F",
        density: "7.28 pcf ±12% (ASTM C303, Sept 2024 sheet)",
        compressive: "90 psi average; 60 psi lower spec limit (block, ASTM C165/C240/C552)",
        e84: "0/0 (ASTM E84 / UL 723)",
        vapor: "0.00 perm·in (ASTM E96 wet cup)",
        combustibility: "Noncombustible per ASTM E136",
        sources: ["S1", "S4"],
      },
    ],
    gaps: [
      "“FOAMGLAS 18” was not found in OC's catalog or product guide; “18” appears to refer to the 18 in. block width. Only FOAMGLAS ONE is listed.",
      "Max temperature: OC 900°F vs ASTM C552 scope 800°F vs EU pipe-section sheet 430°C.",
      "Density: 7.28 pcf ±12% (Sept 2024) vs 7.18 pcf ±10% (June 2022 sheet and current US product pages).",
      "No inch-pound k for fabricated pipe sections, and no US pipe-covering size table or section length.",
      "Large-format block thickness: 4–7 in. (data sheet), 3–8 in. (web page), 3–7 in. (product guide).",
    ],
    sources: [
      { id: "S1", label: "Owens Corning / Pittsburgh Corning, LLC – FOAMGLAS® ONE™ Insulation – Industrial Pipe & Equipment Insulation, ASTM C552 Grade 6, Product Data Sheet (Pub. No. 10024264-C, September 2024)", url: "https://www.owenscorning.com/dms/10024264" },
      { id: "S2", label: "Owens Corning / Pittsburgh Corning, LLC – PDS – FOAMGLAS ONE – ASTM – en (Pub. No. 10024264-B, June 2022)", url: "https://www.foamglas.com/-/media/project/foamglas/public/shared/files/foamglas-i/one/us/pds/pds---foamglas-one-astm-en.pdf" },
      { id: "S4", label: "ASTM International – ASTM C552-22 Standard Specification for Cellular Glass Thermal Insulation (scope page) (C552-22 (active))", url: "https://store.astm.org/c0552-22.html" },
      { id: "S5", label: "ASTM International – ASTM C1639-19(2025) Standard Specification for Fabrication of Cellular Glass Pipe and Tubing Insulation (abstract/scope page) (C1639-19(2025) (active))", url: "https://store.astm.org/c1639-19r25.html" },
      { id: "S6", label: "Owens Corning / Pittsburgh Corning, LLC – FOAMGLAS® Insulation Systems – Industrial & Commercial Product Guide (Pub. No. 10023979-B, April 2026)", url: "https://www.owenscorning.com/dms/10023979" },
      { id: "S7", label: "Owens Corning / Pittsburgh Corning LLC – FOAMGLAS® Cellular Glass Insulation Systems for CUI Mitigation (Pub. No. 10024020, August 2021)", url: "https://www.owenscorning.com/dms/10024020" },
      { id: "S8", label: "Owens Corning FOAMGLAS – FOAMGLAS® ONE™ insulation (ASTM) – product page (accessed 2026-10-10)", url: "https://www.foamglas.com/en/products/blocks/one-standard-us" },
      { id: "S9", label: "Owens Corning FOAMGLAS – FOAMGLAS® ONE™ insulation Large (ASTM) – product page (accessed 2026-10-10)", url: "https://www.foamglas.com/en/products/blocks/one-large-us" },
      { id: "S10", label: "Pittsburgh Corning Europe NV (Owens Corning) – FOAMGLAS® ONE™ Prefabricated Ware – Product Data Sheet (EN 14305) (November 2020)", url: "https://www.foamglas.com/-/media/project/foamglas/public/shared/files/foamglas-i/fabricated-systems/pds/pds-fabware-foamglas-one-eu-en.pdf" },
      { id: "S13", label: "Owens Corning FOAMGLAS – FOAMGLAS products catalog (accessed 2026-10-10)", url: "https://www.foamglas.com/en/products" },
    ],
  },
  elastomeric: {
    id: 'elastomeric',
    name: "Flexible Elastomeric",
    astm: "ASTM C534 Type I, Grade 1",
    summary: "Closed-cell elastomeric (NBR/PVC) foam tube for refrigerant, chilled-water and HVAC piping from −297°F to 220°F. Its low vapor permeability means most indoor cold lines need no added vapor retarder, but every seam must be glued and outdoor runs need UV protection.",
    applications: [
      "HVAC, VRV/VRF and chiller piping",
      "Refrigerant, chilled-water and cold-water plumbing lines",
      "Hot-water plumbing, dual-temperature and solar thermal piping (Insul-Tube)",
      "Outdoor HVAC linesets with factory UV-jacketed tube (K-FLEX TITAN)",
    ],
    pros: [
      "Closed cell with low vapor permeability (0.05 perm-in AP; <0.01 Insul-Tube); no separate vapor retarder normally needed",
      "Flexible and non-fracturing; tube slides on before connection or slits over existing pipe",
      "Fiber-free and non-dusting; GREENGUARD certified",
      "25/50 E84 rated through 2 in. wall (both tubes)",
    ],
    cons: [
      "220°F maximum for NBR/PVC tube (250°F is only a test or short-spike figure); not for steam",
      "Outdoors needs paint or jacketing for UV protection unless factory-jacketed",
      "Every seam and butt joint must be glued with contact adhesive",
      "Wall thickness tops out at 2 in., so thicker cold-service work needs multiple layers",
    ],
    sizes: "Walls 3/8–2 in.; 6 ft (72 in.) tubes. AP ArmaFlex: 1/4 in. ID (black only) to 10 in. ID; IPS to 10 in.; copper 3/16–4 in. nominal (6 in. at 1-1/2 in. wall); some larger sizes may ship as two 3 ft sections. Insul-Tube: 3/8 in. ID to 8 in. IPS; copper IDs 3/8–4-1/8 in.",
    products: [
      {
        name: "Armacell AP ArmaFlex (black/white tube)",
        tempF: { min: -297, max: 220, note: "3/8–1 in. NBR/PVC walls. 1-1/2 and 2 in. EPDM walls: −297 to 300°F. Contact Armacell below −40°F" },
        k: [{ meanF: 50, k: 0.235 }, { meanF: 75, k: 0.245 }, { meanF: 100, k: 0.257 }, { meanF: 125, k: 0.268 }],
        kNote: "ASTM C177/C518, 3/8–1 in. walls. 1-1/2–2 in. EPDM walls: 0.278 at 50°F, 0.28 at 75°F, 0.289 at 100°F, 0.3 at 125°F",
        e84: "25/50 rated, tube walls through 2 in.",
        vapor: "0.05 perm-in (3/8–1 in. walls); 0.08 perm-in (1-1/2–2 in.), ASTM E96 Proc. A",
        combustibility: "No ASTM E136 noncombustible claim",
        sources: ["S1"],
      },
      {
        name: "K-FLEX Insul-Tube",
        tempF: { min: -297, max: 220, note: "Intermittent spikes to 250°F; contact K-FLEX below −40°F" },
        k: [{ meanF: 32, k: 0.235 }, { meanF: 75, k: 0.245 }, { meanF: 90, k: 0.258 }],
        kNote: "ASTM C177",
        density: "3–6 pcf (ASTM D1667)",
        e84: "25/50 rated, 2 in. wall and below",
        vapor: "<0.01 perm-in (ASTM E96, dry cup)",
        combustibility: "No ASTM E136 noncombustible claim",
        sources: ["S10"],
      },
    ],
    gaps: [
      "The dataset also covers K-FLEX TITAN (jacketed Insul-Tube: −70 to 220°F, one k point, 0.23 at 75°F) and K-FLEX ST (EU product, SI values only); neither is shown as a product here.",
      "AP ArmaFlex values come from the Oct 2021 TDS; newer Armacell sheets returned HTTP 404 and were not used.",
      "The AP ArmaFlex TDS lists no density (3.85 pcf appears only as an EPD declared-unit value).",
      "250°F is a 96-hour ASTM C411 test result (AP) or an intermittent spike limit (K-FLEX), not a continuous rating.",
      "AP lists C534 Grade 1 but rates its EPDM walls to 300°F, the C534 Grade 2 range; the TDS does not claim Grade 2.",
    ],
    sources: [
      { id: "S1", label: "Armacell LLC (distributor-hosted copy on Zoro) – TECHNICAL DATA – AP ArmaFlex® Black and White Tube Insulation (AP ArmaFlex | Tube TDS | 102021 | NA | EN-A | 107) (Oct 2021)", url: "https://zoro.com/static/cms/enhanced_pdf/Amerisafe%20Inc_APxxArmaFlexxxTube.Sub.EN.US.2021xxbbcf71.pdf" },
      { id: "S4", label: "Armacell – ArmaFlex North America Application Manual (EN-US) (PDF created Oct 25, 2025)", url: "https://www.armacell.com/sites/default/files/2025/10/27/ArmaFlex_NA_ApplicationManual_EN-US.pdf" },
      { id: "S5", label: "Armacell LLC / UL Environment – Environmental Product Declaration – AP ArmaFlex Tube Insulation (UL Environment declaration 4789527027.102.2) (Issued Oct 1, 2020; expires Sep 30, 2026)", url: "https://www.armacell.com/sites/default/files/2025/10/02/102.2_Armacell%20LLC-USA_AP%20ArmaFlex%20Tube%20Insulation.pdf" },
      { id: "S6", label: "Armacell (distributor-hosted, Wolseley) – Armaflex Tubing Insulation (legacy catalog section incl. size tables with copper tube OD) (PDF dated Aug 2007; cites ASTM E84-91a)", url: "https://www.wolseleyexpress.com/en/ProductDocument/GenerateProductDocumentFile/4994" },
      { id: "S7", label: "K-FLEX USA LLC – K-FLEX® TITAN™ leaflet with technical data (file US_LEA_TITAN_V5_HRES_0821; footer US_LEA_TITAN_V3_0920) (PDF created Aug 31, 2021)", url: "https://db.kflex.com/file/marketing?f=US_LEA_TITAN_V5_HRES_0821.pdf" },
      { id: "S10", label: "K-FLEX USA LLC – K-FLEX® INSUL-TUBE® leaflet with technical data (US_LEA_INSUL-TUBE_V1_0520) (May 2020)", url: "https://db.kflex.com/file/marketing?f=US_LEA_INSUL-TUBE_V1_LRES_0520.pdf" },
      { id: "S12", label: "L'Isolante K-FLEX S.p.A. – K-FLEX® ST technical data (K-FLEX ST_0526) (May 2026)", url: "https://db.kflex.com/file/marketing?f=K-FLEX%20ST_0526.pdf" },
      { id: "S14", label: "ASTM International – ASTM C534/C534M-26 Standard Specification for Preformed Flexible Elastomeric Cellular Thermal Insulation in Sheet and Tubular Form (scope page) (C534/C534M-26, active; last updated May 27, 2026)", url: "https://store.astm.org/c0534_c0534m-26.html" },
    ],
  },
  phenolic: {
    id: 'phenolic',
    name: "Phenolic Foam",
    astm: "ASTM C1126 Types II and III, Grade 1",
    summary: "Rigid closed-cell phenolic foam for chilled-water and other below-ambient piping, rated −290°F to 250°F (Resolco). Pipe sections are cut from bun stock by approved fabricators, and cold service needs a sealed vapor-retarder jacket.",
    applications: [
      "Chilled-water piping, indoor and outdoor (Resolco thickness tables cover NPS 1/2–48 in.)",
      "Below-ambient cold service and anti-sweat (Resolco: not cryogenic)",
      "Heating hot water piping",
      "Building-services pipes and ducts in hospitals, offices, schools, and food and pharmaceutical plants",
      "Load-bearing pipe supports and inserts in 3.75, 5.0 and 7.5 pcf",
    ],
    pros: [
      "k 0.18 at 2.5 pcf (R-5.56 at 1 in., per Resolco)",
      "Closed cell (minimum 92%); water absorption 0.61% by volume (ASTM C209)",
      "E84 25/50, faced and unfaced, from 1 in. up to 3 in. thick",
      "Heavy densities for matching pipe supports, up to 150 psi (7.5 pcf, parallel to rise)",
    ],
    cons: [
      "250°F maximum; not for steam or high-temperature process",
      "Low compressive strength at 2.5 pcf (24.1 psi at 10%), so supports need heavier-density inserts",
      "Below-ambient service needs a continuous vapor retarder: factory jacket, sealed joints and vapor stops",
      "Supplied as bun stock; pipe sections and fittings are fabricated items, not a stock catalog range",
    ],
    sizes: "No stock size range published; fabricated to order from bun stock (ASTM C450/C585). Install guide: max 2.5 in. single layer; each layer at least 1 in. in multilayer work.",
    products: [
      {
        name: "Resolco Insul-Phen (2.5 pcf)",
        tempF: { min: -290, max: 250, note: "ASTM C1126 scope is −40 to 257°F, down to −290°F with a vapor retarder on the warm surface" },
        k: [],
        kNote: "0.18 published (ASTM C518) with no mean temperature printed; no k curve",
        density: "2.5 pcf nominal (ASTM D1622); 3.75, 5.0 and 7.5 pcf also made",
        compressive: "24.1 psi at 10% deflection (ASTM D1621)",
        e84: "25/50, faced and unfaced, 1 in. up to 3 in. thick",
        vapor: "VentureWrap/VentureClad factory jackets 0 perm; foam perm-in not published",
        combustibility: "No ASTM E136 noncombustibility claim",
        sources: ["S1", "S2", "S3", "S7"],
      },
    ],
    gaps: [
      "Kingspan Kooltherm Pipe: no US data sheet found (Kingspan US lists only Tarec polyiso pipe insulation); the EU sheet is SI-only, so it is not shown.",
      "k 0.18 has no stated mean temperature; the install guide's 75°F-mean row is left blank.",
      "Compressive strength: 24.1 psi at 10% (data sheet) vs 29 psi minimum (install guide).",
      "Rust prevention: the quick spec says pipe coating is not required; the install guide calls for two epoxy coats on carbon steel below 25°F and stainless 25–250°F.",
      "Vapor stops every 21 ft (quick spec) vs where runs exceed 24 ft (install guide).",
      "Not published: foam vapor permeability, an ASTM E136 result, stock pipe sizes.",
    ],
    sources: [
      { id: "S1", label: "Resolco, Inc. – Insul-Phen Green Insulation - CFC and HCFC free Rigid Phenolic Insulation (data sheet) (January 2018 (PDF ModDate 2023-12-12))", url: "https://www.resolco.com/index_htm_files/Resolco%20Booklet%20Data%20Sheet.pdf" },
      { id: "S2", label: "Resolco, Inc. – Insul-Phen Heavy Density HCFC Free Rigid Phenolic Insulation (July 2010)", url: "https://www.resolco.com/index_htm_files/Resolco%20Heavy%20Density%20Sheet.pdf" },
      { id: "S3", label: "Resolco, Inc. – Quick Specification Guide - Insul-Phen Phenolic Insulation (PDF created 2018-03-16)", url: "https://www.resolco.com/index_htm_files/Resolco%20Booklet%20Quick%20Spec%20Guide.pdf" },
      { id: "S4", label: "Resolco, Inc. – Resolco Insul-Phen Installation Guide - Pipe & Equipment Insulation - Below Ambient (Highlight Install Guide 2018) (PDF ModDate 2018-02-19)", url: "https://www.resolco.com/index_htm_files/Highlight%20Install%20Guide%202018.pdf" },
      { id: "S6", label: "Resolco, Inc. – Resolco, Inc. - Insulphen About Us (accessed 2026-10-10)", url: "https://www.resolco.com/about.htm" },
      { id: "S7", label: "ASTM International – ASTM C1126-24 Standard Specification for Faced or Unfaced Rigid Cellular Phenolic Thermal Insulation (abstract + scope) (C1126-24 (Active; prior C1126-19))", url: "https://store.astm.org/c1126-24.html" },
      { id: "S8", label: "Kingspan Insulation NV (Kingspan Industrial Insulation), Belgium; hosted by distributor Bevego – Technical Data Sheet - Kooltherm® Pipe Insulation (EU) (Version 2018-03-01)", url: "https://www.bevego.se/storage/F8D606153FE39CA34625460375259AB87B345933701048AEF45E00EF48782BA3/0e05db6acc924d87a143b4e35a2e8565/pdf/media/9bbf0bf6d7e64a8e9eb9de250cdbbad6/Kooltherm-TDS-EN-EU-20181119.pdf" },
      { id: "S9", label: "Kingspan – Technical Insulation | Kingspan US (accessed 2026-10-10)", url: "https://www.insulation.kingspan.com/us/en/products/technical-insulation" },
    ],
  },
}

export const SPECS: Record<MaterialSpec['id'], MaterialSpec> = { ...SPECS1, ...SPECS2 }
