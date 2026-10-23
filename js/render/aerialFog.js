// Height fog (adapted from mrdoob/slop-newyork js/sky.js createAerialFogNode, MIT, (c) 2026
// Mr.doob): the haze is thickest down in the streets and thins with height, so from the street it
// reads as before (scene.fog's FogExp2 density, the same at the ground: daylight.js and the draw
// distance in chunks.js still set it), while from the air or a rooftop the far city stays in view,
// in sky-coloured air, a touch lighter looking up into it than down through it. Installed over
// three's fog chunks once, before anything is compiled, so every material with fog gets it (the
// world position worked out from the view matrix, which every non-raw shader has).
import * as THREE from 'three'

export const FOG_H = 400 // m: the height over which the haze thins by e
const FLOOR = 0.55 // (never thinner than this: the streaming still hides what the fog would)
let done = false
export function aerialFog () {
  if (done) return
  done = true
  const C = THREE.ShaderChunk
  C.fog_pars_vertex = `#ifdef USE_FOG
  varying float vFogDepth;
  varying vec3 vFogW;
#endif`
  C.fog_vertex = `#ifdef USE_FOG
  vFogDepth = - mvPosition.z;
  vFogW = (mvPosition.xyz - viewMatrix[3].xyz) * mat3(viewMatrix);
#endif`
  C.fog_pars_fragment = `#ifdef USE_FOG
  uniform vec3 fogColor;
  varying float vFogDepth;
  varying vec3 vFogW;
  #ifdef FOG_EXP2
    uniform float fogDensity;
  #else
    uniform float fogNear;
    uniform float fogFar;
  #endif
#endif`
  C.fog_fragment = `#ifdef USE_FOG
  #ifdef FOG_EXP2
  {
    vec3 fogRay = vFogW - cameraPosition;
    float fogDist = length(fogRay);
    float fogYc = max(cameraPosition.y, 0.0), fogYp = max(vFogW.y, 0.0), fogDy = fogYp - fogYc;
    float fogHc = exp(-fogYc / ${FOG_H.toFixed(1)}), fogHp = exp(-fogYp / ${FOG_H.toFixed(1)});
    float fogAvg = max(abs(fogDy) > 0.5 ? (fogHc - fogHp) * ${FOG_H.toFixed(1)} / fogDy : fogHc, ${FLOOR.toFixed(2)});
    float fogTau = fogDensity * fogDist * fogAvg;
    float fogFactor = 1.0 - exp(- fogTau * fogTau);
    vec3 fogC = fogColor * (1.0 + 0.12 * clamp(fogRay.y / max(fogDist, 1.0) * 4.0, -0.5, 1.0));
    gl_FragColor.rgb = mix(gl_FragColor.rgb, fogC, fogFactor);
  }
  #else
    float fogFactor = smoothstep(fogNear, fogFar, vFogDepth);
    gl_FragColor.rgb = mix(gl_FragColor.rgb, fogColor, fogFactor);
  #endif
#endif`
}
