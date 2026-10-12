/**
 * HDRI files (app/public/hdri, CC0 Poly Haven; CREDITS.md). Phones get the 1k
 * plant yard (a quarter of the download); the studio HDRI is 1k everywhere.
 */
export const STUDIO_HDRI = 'hdri/studio_small_09_1k.hdr'
export const plantHdri = (phone: boolean) => `hdri/abandoned_tank_farm_03_${phone ? '1k' : '2k'}.hdr`
