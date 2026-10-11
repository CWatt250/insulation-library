import type { SimMode } from './types'

/** Plain-English explainers. Kept qualitative: numbers on screen come from the engine. */
export interface Topic { id: string; title: string; body: string[] }

export const TOPICS: Record<string, Topic> = {
  heatLoss: {
    id: 'heatLoss',
    title: 'What is heat loss?',
    body: [
      'A pipe hotter than the air around it constantly gives heat away: the air touching it warms and rises (convection), and the surface radiates heat to everything it can "see".',
      'Insulation slows the heat on its way out. The heat that does get through has to cross the whole thickness first, so the outside surface ends up much cooler than the pipe and both convection and radiation drop.',
      'Heat loss is quoted per foot of pipe (Btu/hr·ft or W/m). Multiply by the length of the run and the hours it runs to get yearly energy.',
    ],
  },
  heatGain: {
    id: 'heatGain',
    title: 'What is heat gain?',
    body: [
      'A cold pipe works the other way round: heat flows from the warmer room into the pipe. That warms the fluid, so the chiller or refrigeration plant has to remove it again.',
      'The same insulation physics applies; the arrows simply point inward. Because the temperature difference is usually smaller than on hot work, cold lines are often sized for condensation control rather than energy.',
    ],
  },
  sweat: {
    id: 'sweat',
    title: 'Why do cold pipes sweat?',
    body: [
      'Air always carries some water vapor. When air touches a surface colder than its dew point, it can no longer hold all of that vapor and the excess condenses as liquid on the surface.',
      'A bare chilled-water or condensate line is usually far below the room\'s dew point, so it beads up, then drips. Insulation keeps the outer surface close to room temperature — above the dew point — so nothing condenses on it.',
    ],
  },
  dewPoint: {
    id: 'dewPoint',
    title: 'What does dew point mean?',
    body: [
      'The dew point is the temperature at which the air in the room would be saturated. It depends on how much moisture the air holds: the same 80°F room has a higher dew point at 80% humidity than at 40%.',
      'Rule of thumb for this tool: if the outer surface is warmer than the dew point, it stays dry. The margin shown is the outer surface temperature minus the dew point.',
    ],
  },
  condensate: {
    id: 'condensate',
    title: 'Why does condensate need insulation?',
    body: [
      'Condensate drain lines carry water that just came off a cooling coil, so the water — and the pipe — are below room temperature. In humid spaces the pipe sweats and drips onto ceilings, equipment and floors.',
      'The goal on these lines is moisture control, not energy: enough insulation (with a sealed vapor retarder) to keep the outer surface above the dew point.',
    ],
  },
  vapor: {
    id: 'vapor',
    title: 'What does a vapor retarder do?',
    body: [
      'On cold work, water vapor is pushed from the warm, humid room toward the cold pipe. If it gets into the insulation, it condenses inside where the temperature falls below the dew point — the green line in the thermal view.',
      'Wet insulation conducts heat much better than dry insulation, so performance falls and the surface may start to sweat; trapped water can also corrode the pipe. A continuous, sealed vapor retarder (ASJ with sealed laps, a membrane, or closed-cell foam with glued seams) keeps the vapor out.',
      'Every lap, butt joint, hanger and penetration has to be sealed. A good thickness with a poor seal can still fail in the field.',
    ],
  },
  surfaceTemp: {
    id: 'surfaceTemp',
    title: 'Why does outer surface temperature matter?',
    body: [
      'On hot lines it decides whether a person can touch the pipe without a burn — personnel protection — and whether the jacket or facing stays within its own temperature limit.',
      'On cold lines it decides whether the surface sweats: it must stay above the dew point.',
    ],
  },
  jacket: {
    id: 'jacket',
    title: 'When does jacketing change performance?',
    body: [
      'A jacket barely adds insulation value, but its emittance — how well it radiates heat — matters. Shiny aluminum or stainless radiates very little; ASJ, PVC and painted surfaces radiate a lot.',
      'On hot lines a shiny metal jacket runs a little hotter on the surface, though heat loss changes only slightly. On cold lines a shiny jacket picks up less heat by radiation, so its surface runs colder — and closer to the dew point. That is why low-emittance jackets can need more insulation for condensation control.',
      'Try it: on Cold Pipe, switch the jacket between PVC and aluminum and watch the surface temperature and margin.',
    ],
  },
  pipeMaterial: {
    id: 'pipeMaterial',
    title: 'Does the pipe material matter?',
    body: [
      'Steel and copper conduct heat so well that their outside surface sits at the fluid temperature; only the insulation outside them slows the heat.',
      'PVC is different: its wall is itself a weak insulator, so a bare PVC line runs a little warmer than the water inside it and gains less heat than a steel pipe of the same size. PVC makers say insulation is often not needed inside conditioned buildings — but in humid spaces a cold PVC line can still drop below the dew point and sweat.',
      'PVC pressure pipe is rated to 140°F, so it does not belong on hot water or steam. Bare copper also radiates less than steel (a lower emittance), which changes a bare line\'s heat flow a little.',
      'Try it: on Condensate, switch Pipe material between Steel and PVC and watch the bare-pipe surface temperature.',
    ],
  },
}

export const LEARN: Record<SimMode, string[]> = {
  hot: ['heatLoss', 'surfaceTemp', 'jacket', 'pipeMaterial'],
  cold: ['heatGain', 'sweat', 'dewPoint', 'vapor', 'jacket', 'pipeMaterial'],
  condensate: ['condensate', 'sweat', 'dewPoint', 'vapor', 'jacket', 'pipeMaterial'],
}

export const INTRO: Record<SimMode, string> = {
  hot: 'Insulation reduces the heat leaving the pipe. Thicker insulation lowers energy loss and brings the outer surface temperature down for safer contact.',
  cold: 'Insulation slows heat gain into the cold pipe. If the outside surface stays above the dew point, condensation is avoided.',
  condensate: 'Condensate lines sweat when their outside surface is colder than the dew point of the room air. Enough insulation — sealed with a good vapor retarder — keeps the surface dry.',
}
