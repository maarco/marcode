import { ThreeShaderCanvas, type ThreeShaderPalette } from "./ThreeShaderCanvas";
import { resolveChatAmbientShaderPalette, type ChatAmbientEffectProps } from "./chatAmbientEffects";
import { useMemo } from "react";

const SWIRL_FRAGMENT_SHADER = `
  precision highp float;

  uniform vec3 uBackground;
  uniform vec3 uColorA;
  uniform vec3 uColorB;
  uniform vec2 uResolution;
  uniform float uTime;
  varying vec2 vUv;

  float hash21(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
  }

  void main() {
    float aspect = uResolution.x / max(uResolution.y, 1.0);
    vec2 p = (vUv - 0.5) * vec2(aspect, 1.0);
    float radius = length(p);
    float angle = atan(p.y, p.x);
    float time = uTime * 0.9;

    angle += 1.8 * exp(-radius * 1.4) + sin(radius * 8.0 - time) * 0.12;
    vec2 swirl = vec2(cos(angle), sin(angle)) * radius;
    float bands = sin(radius * 17.0 - time * 1.8 + sin(angle * 3.0) * 1.8);
    float waves = smoothstep(0.72, 1.0, bands * 0.5 + 0.5);
    float edge = smoothstep(1.15, 0.18, radius);
    float core = exp(-4.5 * length(swirl + vec2(0.04, -0.02)));

    vec2 cells = floor(vUv * uResolution / 4.0);
    float dither = hash21(cells);
    float ink = smoothstep(0.12, 0.92, waves * edge + core * 0.4);
    ink = step(dither * 0.22, ink);

    vec3 color = mix(uBackground, uColorA, edge * 0.28 + waves * 0.16);
    color = mix(color, uColorB, ink * 0.7);
    color += uColorB * core * 0.35;
    color += uColorA * pow(max(0.0, 1.0 - radius), 4.0) * 0.12;

    gl_FragColor = vec4(color, 1.0);
  }
`;

export function ThreeSwirl({ appearance, theme }: ChatAmbientEffectProps) {
  const palette: ThreeShaderPalette = useMemo(
    () => resolveChatAmbientShaderPalette(appearance, theme),
    [appearance, theme],
  );

  return (
    <ThreeShaderCanvas fragmentShader={SWIRL_FRAGMENT_SHADER} palette={palette} theme={theme} />
  );
}
