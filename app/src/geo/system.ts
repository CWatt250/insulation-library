import { INSULATION, type FacingId, type OuterJacketId, type ServiceId } from '../data/catalog'
import type { AssemblyParams } from './assembly'

/**
 * Which facing, jacket and vapor retarder a system really gets — plain data,
 * no three.js, so the simulator (and the engine other apps load) can use it
 * without the 3D builder.
 */

export type VaporBy = 'none' | 'facing' | 'integral' | 'membrane'

/** Resolve facing, service and jacket into the system actually built (also used by the UI). */
export function resolveSystem(p: Pick<AssemblyParams, 'insulation' | 'jacket' | 'facing' | 'service'>) {
  const ins = INSULATION[p.insulation]
  let jacketId = p.jacket as OuterJacketId
  let facing: FacingId = p.facing ?? ins.facings[0]
  if (p.jacket === 'asj' || p.jacket === 'fsk') {
    facing = 'asj'
    jacketId = 'none'
  }
  if (!ins.facings.includes(facing)) facing = ins.facings[0]
  const service: ServiceId = p.service && ins.services.includes(p.service) ? p.service : ins.services[0]
  // a cold fibrous system needs its ASJ: the facing is the vapor retarder
  if (service === 'cold' && ins.vapor.kind === 'facing' && ins.facings.includes('asj')) facing = 'asj'
  let vaporBy: VaporBy = 'none'
  let membrane = false
  if (service === 'cold') {
    if (ins.vapor.kind === 'integral') vaporBy = 'integral'
    else if (ins.vapor.kind === 'facing' && facing === 'asj') {
      vaporBy = 'facing'
      membrane = !!ins.vapor.membraneUnder?.includes(jacketId)
    } else {
      vaporBy = 'membrane'
      membrane = true
    }
  }
  return { ins, jacketId, facing, service, vaporBy, membrane }
}
