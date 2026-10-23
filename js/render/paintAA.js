// Road paint that holds still in the distance (the idea from mrdoob/slop-newyork's lane markings'
// widen(), MIT, (c) 2026 Mr.doob): a line or a dash narrower on screen than a pixel and a half
// crawls and flickers as it moves, so each mark (an instance of geo.js marks()) is drawn at least
// that wide, along and across it, allowing for how flat it is seen, and fades by as much as it was
// widened, so it keeps the same weight on screen but covers its pixels evenly instead of hitting
// some and missing others.
export const PAINT_PX = { value: 720 } // the drawing buffer's height in pixels (post.js)

export function paintAA (m) {
  const before = m.onBeforeCompile
  m.transparent = true
  m.depthWrite = false
  m.onBeforeCompile = (shader, r) => {
    before?.call(m, shader, r)
    shader.uniforms.uPaintPx = PAINT_PX
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        '#include <common>\nuniform float uPaintPx;\nvarying float vPaintFade;'
      )
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        vPaintFade = 1.0;
        #ifdef USE_INSTANCING
        {
          mat4 iw = modelMatrix * instanceMatrix;
          vec3 c = (iw * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
          vec3 ax = (iw * vec4(1.0, 0.0, 0.0, 0.0)).xyz, az = (iw * vec4(0.0, 0.0, 1.0, 0.0)).xyz;
          float len = max(length(ax), 1e-4), wid = max(length(az), 1e-4);
          vec3 d = c - cameraPosition;
          float dist = max(length(d), 0.1);
          vec3 v = d / dist;
          // (a metre's worth of pixels this far off, and how flat the ground is seen)
          float px = 2.0 * dist / (projectionMatrix[1][1] * uPaintPx);
          float flatK = clamp(abs(v.y), 0.05, 1.0);
          vec2 vh = normalize(v.xz + vec2(1e-5));
          float fl = mix(1.0, flatK, abs(dot(ax.xz / len, vh)));
          float fw = mix(1.0, flatK, abs(dot(az.xz / wid, vh)));
          float sl = max(1.0, 1.5 * px / (fl * len)), sw = max(1.0, 1.5 * px / (fw * wid));
          transformed.x *= sl;
          transformed.z *= sw;
          vPaintFade = 1.0 / (sl * sw);
        }
        #endif`
      )
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying float vPaintFade;')
      .replace(
        '#include <color_fragment>',
        '#include <color_fragment>\ndiffuseColor.a *= vPaintFade;'
      )
  }
  const key = m.customProgramCacheKey.bind(m)
  m.customProgramCacheKey = () => `${key()} paintAA`
  return m
}
