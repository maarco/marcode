import * as THREE from "three";
import { useEffect, useRef } from "react";

import type { ChatAmbientEffectProps } from "./chatAmbientEffects";

const MAX_PIXEL_RATIO = 1.35;

const VERTEX_SHADER = `
  varying vec2 vUv;

  void main() {
    vUv = uv;
    gl_Position = vec4(position, 1.0);
  }
`;

export interface ThreeShaderPalette {
  readonly background: number;
  readonly primary: number;
  readonly secondary: number;
}

interface ThreeShaderCanvasProps extends ChatAmbientEffectProps {
  readonly fragmentShader: string;
  readonly palette: ThreeShaderPalette;
}

export function ThreeShaderCanvas({ theme, fragmentShader, palette }: ThreeShaderCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({
        alpha: true,
        antialias: false,
        canvas,
        powerPreference: "low-power",
      });
    } catch {
      canvas.dataset.chatAmbientRenderer = "fallback";
      return;
    }

    canvas.dataset.chatAmbientRenderer = "three";
    renderer.setClearColor(0x000000, 0);

    const scene = new THREE.Scene();
    const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    const uniforms = {
      uBackground: { value: new THREE.Color(palette.background) },
      uColorA: { value: new THREE.Color(palette.primary) },
      uColorB: { value: new THREE.Color(palette.secondary) },
      uResolution: { value: new THREE.Vector2(1, 1) },
      uTime: { value: 0 },
    };
    const geometry = new THREE.PlaneGeometry(2, 2);
    const material = new THREE.ShaderMaterial({
      fragmentShader,
      uniforms,
      vertexShader: VERTEX_SHADER,
    });
    scene.add(new THREE.Mesh(geometry, material));

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      const width = Math.max(1, rect.width);
      const height = Math.max(1, rect.height);
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, MAX_PIXEL_RATIO));
      renderer.setSize(width, height, false);
      uniforms.uResolution.value.set(width, height);
    };

    const render = (elapsed: number) => {
      uniforms.uTime.value = elapsed;
      renderer.render(scene, camera);
    };

    resize();
    const motionQuery = window.matchMedia?.("(prefers-reduced-motion: reduce)") ?? null;
    let animationFrame = 0;
    let reducedMotion = motionQuery?.matches ?? false;
    const animate = (now: number) => {
      render(now * 0.001);
      animationFrame = window.requestAnimationFrame(animate);
    };
    const restartAnimation = () => {
      window.cancelAnimationFrame(animationFrame);
      reducedMotion = motionQuery?.matches ?? false;
      if (reducedMotion) {
        render(0);
        animationFrame = 0;
        return;
      }
      animationFrame = window.requestAnimationFrame(animate);
    };
    const handleMotionChange = () => restartAnimation();
    const resizeObserver =
      typeof ResizeObserver === "undefined"
        ? null
        : new ResizeObserver(() => {
            resize();
            if (reducedMotion) render(0);
          });

    resizeObserver?.observe(canvas);
    window.addEventListener("resize", resize);
    motionQuery?.addEventListener("change", handleMotionChange);
    restartAnimation();

    return () => {
      window.cancelAnimationFrame(animationFrame);
      window.removeEventListener("resize", resize);
      motionQuery?.removeEventListener("change", handleMotionChange);
      resizeObserver?.disconnect();
      geometry.dispose();
      material.dispose();
      renderer.dispose();
    };
  }, [fragmentShader, palette, theme]);

  return <canvas ref={canvasRef} className="absolute inset-0 size-full" data-chat-ambient-canvas />;
}
