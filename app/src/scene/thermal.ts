import * as THREE from 'three'
import type { SimVisual } from './effects'

/**
 * False-colour temperature material for the Thermal view. The radial profile
 * comes from the engine (sim/engine.ts) and is looked up per pixel from the
 * fragment's distance to the pipe axis, so cut faces show the real gradient
 * through the insulation. On cold work a line marks the dew-point isotherm.
 */

// --------------------------------------------------------------- thermal

const thermalVert = /* glsl */ `
  varying float vR;
  varying vec3 vN;
  varying vec3 vView;
  void main() {
    vR = length(position.xy);
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    vN = normalize(normalMatrix * normal);
    vView = -mv.xyz;
    gl_Position = projectionMatrix * mv;
  }
`

const thermalFrag = /* glsl */ `
  #define N 12
  uniform float uS[N];
  uniform float uT[N];
  uniform float uRPipe;
  uniform float uRIns;
  uniform float uProcess;
  uniform float uSurface;
  uniform float uAmbient;
  uniform float uSpan;
  uniform float uDew;
  uniform float uShowDew;
  uniform float uBare;
  varying float vR;
  varying vec3 vN;
  varying vec3 vView;

  vec3 ramp(float t) {
    // diverging: blue (cold) — pale (ambient) — yellow / orange / red (hot)
    vec3 c0 = vec3(0.04, 0.11, 0.45);
    vec3 c1 = vec3(0.06, 0.45, 0.90);
    vec3 c2 = vec3(0.55, 0.80, 0.95);
    vec3 c3 = vec3(0.80, 0.78, 0.72);
    vec3 c4 = vec3(0.98, 0.80, 0.20);
    vec3 c5 = vec3(0.95, 0.38, 0.06);
    vec3 c6 = vec3(0.60, 0.04, 0.04);
    if (t < -0.66) return mix(c0, c1, (t + 1.0) / 0.34);
    if (t < -0.25) return mix(c1, c2, (t + 0.66) / 0.41);
    if (t < 0.0) return mix(c2, c3, (t + 0.25) / 0.25);
    if (t < 0.25) return mix(c3, c4, t / 0.25);
    if (t < 0.66) return mix(c4, c5, (t - 0.25) / 0.41);
    return mix(c5, c6, (t - 0.66) / 0.34);
  }

  float tempAt(float r) {
    if (uBare > 0.5) return uProcess;
    if (r <= uRPipe + 0.0006) return uProcess;
    if (r >= uRIns) return uSurface;
    float s = log(r / uRPipe) / log(uRIns / uRPipe);
    float t = uT[0];
    for (int i = 1; i < N; i++) {
      if (s <= uS[i]) {
        float f = (s - uS[i - 1]) / max(uS[i] - uS[i - 1], 1e-5);
        return mix(uT[i - 1], uT[i], clamp(f, 0.0, 1.0));
      }
      t = uT[i];
    }
    return t;
  }

  void main() {
    float T = tempAt(vR);
    float t = clamp((T - uAmbient) / uSpan, -1.0, 1.0);
    vec3 c = ramp(t);
    // simple studio shading so the form still reads
    vec3 n = normalize(vN);
    if (!gl_FrontFacing) n = -n;
    vec3 l = normalize(vec3(0.35, 0.85, 0.4));
    float diff = max(dot(n, l), 0.0);
    float rim = pow(1.0 - max(dot(n, normalize(vView)), 0.0), 3.0);
    c *= (0.6 + 0.4 * diff) * 0.74;
    c += rim * 0.05;
    // dew-point isotherm inside the insulation (cold work)
    if (uShowDew > 0.5 && vR > uRPipe + 0.001 && vR < uRIns - 0.0005) {
      float w = fwidth(T) * 1.4 + 0.05;
      float line = 1.0 - smoothstep(0.0, w, abs(T - uDew));
      c = mix(c, vec3(0.10, 0.95, 0.80), line);
    }
    gl_FragColor = vec4(c, 1.0);
  }
`

export function thermalMaterial() {
  return new THREE.ShaderMaterial({
    vertexShader: thermalVert,
    fragmentShader: thermalFrag,
    side: THREE.DoubleSide,
    uniforms: {
      uS: { value: new Array(12).fill(0) },
      uT: { value: new Array(12).fill(0) },
      uRPipe: { value: 0.05 },
      uRIns: { value: 0.1 },
      uProcess: { value: 300 },
      uSurface: { value: 90 },
      uAmbient: { value: 75 },
      uSpan: { value: 200 },
      uDew: { value: 50 },
      uShowDew: { value: 0 },
      uBare: { value: 0 },
    },
  })
}

/** Push the current simulation into a thermal material's uniforms. */
export function updateThermal(mat: THREE.ShaderMaterial, v: SimVisual, rPipe: number, rIns: number) {
  const u = mat.uniforms
  const prof = v.profile.length ? v.profile : [{ s: 0, tF: v.processF }, { s: 1, tF: v.surfaceF }]
  const S = u.uS.value as number[]
  const T = u.uT.value as number[]
  for (let i = 0; i < 12; i++) {
    const p = prof[Math.round((i / 11) * (prof.length - 1))]
    S[i] = p.s
    T[i] = p.tF
  }
  u.uRPipe.value = rPipe
  u.uRIns.value = rIns
  u.uProcess.value = v.processF
  u.uSurface.value = v.surfaceF
  u.uAmbient.value = v.ambientF
  u.uSpan.value = Math.max(Math.abs(v.processF - v.ambientF), 10)
  u.uDew.value = v.dewF
  u.uShowDew.value = v.mode !== 'hot' && v.dewF > v.processF && v.dewF < v.ambientF ? 1 : 0
  u.uBare.value = v.bare ? 1 : 0
}
