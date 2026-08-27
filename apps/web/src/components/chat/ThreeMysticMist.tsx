import { ThreeShaderCanvas, type ThreeShaderPalette } from "./ThreeShaderCanvas";
import { resolveChatAmbientShaderPalette, type ChatAmbientEffectProps } from "./chatAmbientEffects";
import { useMemo } from "react";

const MYSTIC_MIST_FRAGMENT_SHADER = `
  precision highp float;

  uniform vec3 uBackground;
  uniform vec3 uColorA;
  uniform vec3 uColorB;
  uniform vec2 uResolution;
  uniform float uTime;
  varying vec2 vUv;

  float hash21(vec2 p) {
    p = fract(p * vec2(123.34, 456.21));
    p += dot(p, p + 45.32);
    return fract(p.x * p.y);
  }

  float noise(vec2 p) {
    vec2 cell = floor(p);
    vec2 local = fract(p);
    local = local * local * (3.0 - 2.0 * local);
    float a = hash21(cell);
    float b = hash21(cell + vec2(1.0, 0.0));
    float c = hash21(cell + vec2(0.0, 1.0));
    float d = hash21(cell + vec2(1.0, 1.0));
    return mix(mix(a, b, local.x), mix(c, d, local.x), local.y);
  }

  float fbm(vec2 p) {
    float value = 0.0;
    float amplitude = 0.5;
    for (int index = 0; index < 5; index += 1) {
      value += amplitude * noise(p);
      p = p * 2.03 + vec2(17.1, 9.2);
      amplitude *= 0.5;
    }
    return value;
  }

  void main() {
    float aspect = uResolution.x / max(uResolution.y, 1.0);
    vec2 p = (vUv - 0.5) * vec2(aspect, 1.0);
    float time = uTime * 0.08;
    vec2 drift = vec2(time * 0.32, -time * 0.2);
    vec2 warp = vec2(
      fbm(p * 1.4 + drift),
      fbm(p * 1.7 - drift.yx + 8.0)
    ) - 0.5;
    float mist = fbm(p * 2.1 + warp * 1.7 - drift);
    float veil = smoothstep(0.28, 0.78, mist);
    float glow = exp(-2.4 * length(p + vec2(0.16, 0.08))) * 0.28;

    float current = sin((p.x + p.y * 0.8 + fbm(p * 3.0 + drift) * 0.75) * 15.0 - uTime * 0.9);
    float filament = pow(max(0.0, current), 24.0) * smoothstep(1.15, 0.08, length(p));
    float filamentSoft = pow(max(0.0, current), 6.0) * 0.08;

    vec3 color = uBackground;
    color = mix(color, uColorA, veil * 0.5 + glow);
    color += uColorB * (filament * 0.42 + filamentSoft + glow * 0.18);
    color += uColorA * pow(max(0.0, 0.5 - length(p + vec2(-0.2, 0.2))), 2.0) * 0.12;

    gl_FragColor = vec4(color, 1.0);
  }
`;

export function ThreeMysticMist({ appearance, theme }: ChatAmbientEffectProps) {
  const palette: ThreeShaderPalette = useMemo(
    () => resolveChatAmbientShaderPalette(appearance, theme),
    [appearance, theme],
  );

  return (
    <ThreeShaderCanvas
      fragmentShader={MYSTIC_MIST_FRAGMENT_SHADER}
      palette={palette}
      theme={theme}
    />
  );
}
