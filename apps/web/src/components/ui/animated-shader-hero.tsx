import { useEffect, useRef } from "react";

import { cn } from "~/lib/utils";

const VERTEX_SHADER = `#version 300 es
precision highp float;
in vec4 position;
void main() {
  gl_Position = position;
}`;

// Adapted from the supplied animated-shader-hero background. The draft hero
// only needs the canvas layer; its existing headline and composer remain the
// interactive foreground.
const FRAGMENT_SHADER = `#version 300 es
precision highp float;
out vec4 O;
uniform vec2 resolution;
uniform float time;
#define FC gl_FragCoord.xy
#define T time
#define R resolution
#define MN min(R.x, R.y)

float rnd(vec2 p) {
  p = fract(p * vec2(12.9898, 78.233));
  p += dot(p, p + 34.56);
  return fract(p.x * p.y);
}

float noise(in vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  float a = rnd(i);
  float b = rnd(i + vec2(1.0, 0.0));
  float c = rnd(i + vec2(0.0, 1.0));
  float d = rnd(i + 1.0);
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}

float fbm(vec2 p) {
  float total = 0.0;
  float amplitude = 1.0;
  mat2 matrix = mat2(1.0, -0.5, 0.2, 1.2);
  for (int i = 0; i < 5; i++) {
    total += amplitude * noise(p);
    p *= 2.0 * matrix;
    amplitude *= 0.5;
  }
  return total;
}

float clouds(vec2 p) {
  float density = 1.0;
  float total = 0.0;
  for (float i = 0.0; i < 3.0; i++) {
    float layerSample = density * fbm(i * 10.0 + p.x * 0.2 + 0.2 * (1.0 + i) * p.y + density + i * i + p);
    total = mix(total, density, layerSample);
    density = layerSample;
    p *= 2.0 / (i + 1.0);
  }
  return total;
}

void main() {
  vec2 uv = (FC - 0.5 * R) / MN;
  vec2 st = uv * vec2(2.0, 1.0);
  vec3 color = vec3(0.0);
  float background = clouds(vec2(st.x + T * 0.5, -st.y));
  uv *= 1.0 - 0.3 * (sin(T * 0.2) * 0.5 + 0.5);

  for (float i = 1.0; i < 12.0; i++) {
    uv += 0.1 * cos(i * vec2(0.1 + 0.01 * i, 0.8) + i * i + T * 0.5 + 0.1 * uv.x);
    vec2 point = uv;
    float distanceFromCenter = length(point);
    color += 0.00125 / distanceFromCenter * (cos(sin(i) * vec3(1.0, 2.0, 3.0)) + 1.0);
    float brightness = noise(i + point + background * 1.731);
    color += 0.002 * brightness / length(max(point, vec2(brightness * point.x * 0.02, point.y)));
    color = mix(color, vec3(background * 0.08, background * 0.105, background * 0.16), distanceFromCenter);
  }

  O = vec4(color, 1.0);
}`;

interface AnimatedShaderHeroProps {
  readonly className?: string;
}

function compileShader(gl: WebGL2RenderingContext, type: number, source: string) {
  const shader = gl.createShader(type);
  if (!shader) return null;
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    console.error("Animated shader hero compilation error:", gl.getShaderInfoLog(shader));
    gl.deleteShader(shader);
    return null;
  }
  return shader;
}

export default function AnimatedShaderHeroBackground({ className }: AnimatedShaderHeroProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const gl = canvas.getContext("webgl2", {
      alpha: false,
      antialias: false,
      powerPreference: "high-performance",
    });
    if (!gl) return;

    const vertexShader = compileShader(gl, gl.VERTEX_SHADER, VERTEX_SHADER);
    const fragmentShader = compileShader(gl, gl.FRAGMENT_SHADER, FRAGMENT_SHADER);
    if (!vertexShader || !fragmentShader) return;

    const program = gl.createProgram();
    const buffer = gl.createBuffer();
    if (!program || !buffer) return;

    gl.attachShader(program, vertexShader);
    gl.attachShader(program, fragmentShader);
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      console.error("Animated shader hero link error:", gl.getProgramInfoLog(program));
      return;
    }

    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, 1, -1, -1, 1, 1, 1, -1]), gl.STATIC_DRAW);

    const position = gl.getAttribLocation(program, "position");
    const resolution = gl.getUniformLocation(program, "resolution");
    const time = gl.getUniformLocation(program, "time");
    if (position < 0 || !resolution || !time) return;

    gl.useProgram(program);
    gl.enableVertexAttribArray(position);
    gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      const deviceScale = Math.max(1, 0.5 * window.devicePixelRatio);
      canvas.width = Math.max(1, Math.floor(rect.width * deviceScale));
      canvas.height = Math.max(1, Math.floor(rect.height * deviceScale));
      gl.viewport(0, 0, canvas.width, canvas.height);
    };

    let animationFrame = 0;
    const render = (now: number) => {
      resize();
      gl.useProgram(program);
      gl.uniform2f(resolution, canvas.width, canvas.height);
      gl.uniform1f(time, now * 1e-3);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      animationFrame = window.requestAnimationFrame(render);
    };

    resize();
    window.addEventListener("resize", resize);
    animationFrame = window.requestAnimationFrame(render);

    return () => {
      window.removeEventListener("resize", resize);
      window.cancelAnimationFrame(animationFrame);
      gl.deleteBuffer(buffer);
      gl.deleteProgram(program);
      gl.deleteShader(vertexShader);
      gl.deleteShader(fragmentShader);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden
      data-animated-shader-hero
      className={cn("pointer-events-none absolute inset-0 h-full w-full", className)}
      style={{ background: "var(--background)" }}
    />
  );
}
