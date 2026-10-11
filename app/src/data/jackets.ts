import type { OuterJacketId } from './catalog'
import type { Source } from './specs'

/**
 * Jacket and facing limits for the data card, distilled from
 * research/jackets-verified.json (source ids J1–J39 are that file's).
 * Keep each line traceable; values the file marks unverified are left out.
 */

export interface JacketSpec { limit: string; note?: string }

type Key = 'asj' | 'pvc' | 'alu' | 'ss'

export const jacketSpecKey = (j: OuterJacketId): Key | null =>
  j === 'alu-smooth' || j === 'alu-stucco' ? 'alu' : j === 'ss' ? 'ss' : j === 'pvc' ? 'pvc' : null

export const JACKET_SPECS: Record<Key, JacketSpec> & { sources: Source[] } = {
  asj: {
    // J24 C1136 scope; OC ASJ Max and JM ASJ from materials-verified.json
    limit: '−20 to 150°F at the surface',
    note: 'ASTM C1136 scope; OC ASJ Max −20 to 150°F, JM keeps the surface under 150°F. Not for long-term outdoor use.',
  },
  pvc: {
    // J1–J4 Zeston, J6 Proto LoSmoke, J10 ASTM C1917
    limit: 'PVC surface ≤150°F',
    note: 'Insulation must keep the PVC below 150°F, away from radiant heat (JM Zeston); Proto LoSmoke −20 to 150°F. Outdoors: white, 30 mil (JM recommends; Proto requires ≥0.030").',
  },
  alu: {
    // J15 alloy/temper, J17 liner, J19 140°F design note, J20 not a vapor retarder
    limit: 'Liner 180°F long-term, 200°F intermittent',
    note: 'JM: systems are generally designed to keep the jacket ≤140°F. 3105/3003-H14 with 3-mil polyfilm moisture barrier. Not a vapor retarder.',
  },
  ss: {
    // J22/J23 stainless, J17 liner
    limit: 'No limit published for the steel; liner 180°F',
    note: 'T-304, T-316 for the most corrosive areas (ASTM A240); liner optional. Specified for fire or corrosion resistance (JM).',
  },
  sources: [
    { id: "J1", label: "Johns Manville – Zeston 2000 Series PVC Insulated Fitting Covers and Jacketing – Data Sheet (incl. Zeston Hi-Lo Temp Insulation Inserts page) (05/26/26 (Replaces 06/19/25))", url: "https://www.jm.com/content/dam/jm/global/en/insulation-systems/products/assets/data-sheet/mech-zeston-2000-pvc-ds.pdf" },
    { id: "J2", label: "Johns Manville – Zeston PVC Jacketing – Data Sheet (MECH-264 05/26/26 (Replaces 02/28/22))", url: "https://www.jm.com/content/dam/jm/global/en/insulation-systems/products/assets/data-sheet/jm-mech-zeston-pvc-jacketing-ds.pdf" },
    { id: "J4", label: "Johns Manville – Zeston 2000/300 PVC Installation Guide (hot, cold, USDA/FDA guide specifications) (06/21/24 (Replaces 05/06/22))", url: "https://www.jm.com/content/dam/jm/global/en/insulation-systems/products/assets/installation-guide/jm-pvc-install-guide.pdf" },
    { id: "J6", label: "Proto Corporation – LoSmoke PVC Jacketing and Fittings – Submittal Sheet (PTB04 Revised 7/25)", url: "https://www.protocorporation.com/wp-content/uploads/2025/07/proto_technical_pvc_jacketing_fittings_updated_submittal_sheet.pdf" },
    { id: "J10", label: "ASTM International – ASTM C1917-23 Standard Specification for Rigid Polyvinyl Chloride (PVC) Jacketing for Insulation – store scope page (C1917-23 (DOI 10.1520/C1917-23); page last updated Jan 05, 2024)", url: "https://store.astm.org/c1917-23.html" },
    { id: "J12", label: "ASTM International – ASTM C1729-26 Standard Specification for Aluminum Jacketing for Insulation – store scope page (C1729-26 (active))", url: "https://store.astm.org/c1729-26.html" },
    { id: "J14", label: "ASTM International – ASTM C1767-26 Standard Specification for Stainless Steel Jacketing for Insulation – store scope page (C1767-26 (active); scope identical on C1767-21 page)", url: "https://store.astm.org/c1767-26.html" },
    { id: "J15", label: "Johns Manville (formerly Pabco/Childers Metals) – JM Aluminum Roll and Sheet – Aluminum Metal Jacketing/Cladding – Data Sheet (09/26/25 (Replaces ACCS-05/17/23))", url: "https://www.jm.com/content/dam/jm/global/en/insulation-systems/products/assets/data-sheet/jm-ind-aluminumroll-ds.pdf" },
    { id: "J17", label: "Johns Manville – Polyfilm Moisture Barrier – Data Sheet (09/13/23 (Replaces Poly-05/15/23))", url: "https://www.jm.com/content/dam/jm/global/en/insulation-systems/products/assets/data-sheet/jm-ind-polyfilmds.pdf" },
    { id: "J19", label: "Johns Manville – Metal Jacketing Product Selection Guide (brochure) (New 01/31/20)", url: "https://www.jm.com/content/dam/jm/global/en/insulation-systems/products/assets/selector-guide/jm-ind-metal-jacketing-brochure.pdf" },
    { id: "J20", label: "Johns Manville – Metal Jacketing Installation Guide (04/23/24 (Replaces 11/27/23))", url: "https://www.jm.com/content/dam/jm/global/en/insulation-systems/products/assets/installation-guide/jm-ind-metal-jacketing-install-guide.pdf" },
    { id: "J22", label: "Johns Manville (formerly Pabco/Childers Metals) – Stainless Steel Roll & Sheet – Stainless Steel Metal Jacketing – Data Sheet (printed '09/26/15 (Replaces SSRJE-05/17/23)'; PDF modified 2025-09-26)", url: "https://www.jm.com/content/dam/jm/global/en/insulation-systems/products/assets/data-sheet/industrial-stainless-steel-rolls-and-sheet-data-sheet.pdf" },
    { id: "J24", label: "ASTM International – ASTM C1136-23 Standard Specification for Flexible, Low Permeance Vapor Retarders for Thermal Insulation – store scope page (C1136-23 (active); page last updated Mar 14, 2023)", url: "https://store.astm.org/c1136-23.html" },
    { id: "J33", label: "Polyguard Products, Inc. – Insulrap 30-NG Vapor Barrier Membrane – data sheet (footer 'Insulrap I-30-SJ-NG.doc R10-26-18'; PDF modified 2023-04-28)", url: "https://assets.cdn.polyguard.com/resources/MECH_DATASHEET_Insulrap30NG-R10-26-18-2-copy-1.pdf" },
    { id: "J35", label: "Owens Corning / Pittsburgh Corning, LLC – Product Data Sheet – PITTWRAP IW50 AL Jacketing (Pub. No. 10023702-A, July 2021)", url: "https://www.owenscorning.com/dms/10023702" },
    { id: "J37", label: "Owens Corning / Pittsburgh Corning, LLC – Product Data Sheet – PITTCOTE 300E Coating (Pub. No. 10025345, April 2022)", url: "https://www.owenscorning.com/dms/10025345" },
  ],
}
