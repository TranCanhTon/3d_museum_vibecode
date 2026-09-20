import * as THREE from 'three';

const VERTEX_SHADER = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

// Edge detection (Sobel) + posterize + a cheap procedural paper grain,
// blended with the real texture by uReveal (0 = full rough sketch,
// 1 = the real painting) so opening the interact overlay can animate the
// wall art from sketch to photo instead of hard-cutting.
const FRAGMENT_SHADER = /* glsl */ `
  uniform sampler2D uMap;
  uniform vec2 uTexel;
  uniform float uPosterizeLevels;
  uniform float uEdgeStrength;
  uniform float uPaperStrength;
  uniform float uReveal;
  varying vec2 vUv;

  float luma(vec3 c) {
    return dot(c, vec3(0.299, 0.587, 0.114));
  }

  float hash(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
  }

  void main() {
    vec4 texel = texture2D(uMap, vUv);

    // Sobel edge detection on luminance.
    float tl = luma(texture2D(uMap, vUv + uTexel * vec2(-1.0,  1.0)).rgb);
    float t  = luma(texture2D(uMap, vUv + uTexel * vec2( 0.0,  1.0)).rgb);
    float tr = luma(texture2D(uMap, vUv + uTexel * vec2( 1.0,  1.0)).rgb);
    float l  = luma(texture2D(uMap, vUv + uTexel * vec2(-1.0,  0.0)).rgb);
    float r  = luma(texture2D(uMap, vUv + uTexel * vec2( 1.0,  0.0)).rgb);
    float bl = luma(texture2D(uMap, vUv + uTexel * vec2(-1.0, -1.0)).rgb);
    float b  = luma(texture2D(uMap, vUv + uTexel * vec2( 0.0, -1.0)).rgb);
    float br = luma(texture2D(uMap, vUv + uTexel * vec2( 1.0, -1.0)).rgb);

    float gx = -tl - 2.0 * l - bl + tr + 2.0 * r + br;
    float gy = -tl - 2.0 * t - tr + bl + 2.0 * b + br;
    float edge = clamp(sqrt(gx * gx + gy * gy) * uEdgeStrength, 0.0, 1.0);

    // Posterize the base color into flat cartoon-ish bands.
    vec3 posterized = floor(texel.rgb * uPosterizeLevels) / uPosterizeLevels;

    // Cheap paper grain: static per-texel noise, faint.
    float grain = (hash(vUv * 512.0) - 0.5) * uPaperStrength;

    vec3 sketch = posterized * (1.0 - edge * 0.85) + grain;
    sketch = clamp(sketch, 0.0, 1.0);

    vec3 finalColor = mix(sketch, texel.rgb, uReveal);
    gl_FragColor = vec4(finalColor, texel.a);
  }
`;

/**
 * A runtime shader material: the wall canvas always samples the real
 * artwork texture, but renders it as a rough posterized sketch with edge
 * lines and paper grain (uReveal = 0). Animate `material.uniforms.uReveal`
 * toward 1 to morph it into the true image, e.g. when the interact overlay
 * opens.
 */
export function createSketchMaterial(texture, { width, height }) {
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.generateMipmaps = false;
  texture.minFilter = THREE.LinearFilter;

  const image = texture.image;
  const texelX = image?.width ? 1 / image.width : 1 / 512;
  const texelY = image?.height ? 1 / image.height : 1 / 512;

  return new THREE.ShaderMaterial({
    uniforms: {
      uMap: { value: texture },
      uTexel: { value: new THREE.Vector2(texelX, texelY) },
      uPosterizeLevels: { value: 5 },
      uEdgeStrength: { value: 2.2 },
      uPaperStrength: { value: 0.05 },
      uReveal: { value: 0 },
    },
    vertexShader: VERTEX_SHADER,
    fragmentShader: FRAGMENT_SHADER,
    side: THREE.DoubleSide,
  });
}
