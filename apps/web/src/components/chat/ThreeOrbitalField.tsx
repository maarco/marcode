import * as THREE from "three";
import { useEffect, useRef } from "react";

import { resolveChatAmbientShaderPalette, type ChatAmbientEffectProps } from "./chatAmbientEffects";

const MAX_PIXEL_RATIO = 1.35;
const PARTICLE_COUNT = 760;

function seededRandom(seed: number) {
  const value = Math.sin(seed * 12.9898) * 43758.5453;
  return value - Math.floor(value);
}

function createParticleField(color: number) {
  const positions = new Float32Array(PARTICLE_COUNT * 3);

  for (let index = 0; index < PARTICLE_COUNT; index += 1) {
    const angle = seededRandom(index + 1) * Math.PI * 2;
    const radius = Math.sqrt(seededRandom(index + 2)) * 5.8;
    const height = (seededRandom(index + 3) - 0.5) * 4.2;
    const offset = index * 3;
    positions[offset] = Math.cos(angle) * radius;
    positions[offset + 1] = height;
    positions[offset + 2] = Math.sin(angle) * radius;
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));

  const material = new THREE.PointsMaterial({
    blending: THREE.AdditiveBlending,
    color,
    depthWrite: false,
    opacity: 0.34,
    size: 0.032,
    sizeAttenuation: true,
    transparent: true,
  });

  return new THREE.Points(geometry, material);
}

function disposeScene(scene: THREE.Scene) {
  scene.traverse((object) => {
    if (
      !(object instanceof THREE.Mesh) &&
      !(object instanceof THREE.Line) &&
      !(object instanceof THREE.Points)
    ) {
      return;
    }

    object.geometry.dispose();
    const materials = Array.isArray(object.material) ? object.material : [object.material];
    for (const material of materials) {
      material.dispose();
    }
  });
}

export function ThreeOrbitalField({ appearance, theme }: ChatAmbientEffectProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const particleColor = resolveChatAmbientShaderPalette(appearance, theme).secondary;

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
    const camera = new THREE.PerspectiveCamera(34, 1, 0.1, 40);
    camera.position.set(0, 0, 9.2);

    const sceneGroup = new THREE.Group();
    const starField = createParticleField(particleColor);

    sceneGroup.add(starField);
    scene.add(sceneGroup);

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      const width = Math.max(1, rect.width);
      const height = Math.max(1, rect.height);
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, MAX_PIXEL_RATIO));
      renderer.setSize(width, height, false);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
    };

    const render = (elapsed: number) => {
      sceneGroup.rotation.y = elapsed * 0.045;
      sceneGroup.rotation.x = Math.sin(elapsed * 0.16) * 0.045;
      renderer.render(scene, camera);
    };

    resize();

    const motionQuery = window.matchMedia?.("(prefers-reduced-motion: reduce)") ?? null;
    let animationFrame = 0;
    const animate = (now: number) => {
      render(now * 0.001);
      animationFrame = window.requestAnimationFrame(animate);
    };
    const restartAnimation = () => {
      window.cancelAnimationFrame(animationFrame);
      if (motionQuery?.matches) {
        render(0);
        animationFrame = 0;
        return;
      }
      animationFrame = window.requestAnimationFrame(animate);
    };
    const handleMotionChange = () => restartAnimation();
    const resizeObserver =
      typeof ResizeObserver === "undefined" ? null : new ResizeObserver(() => resize());

    resizeObserver?.observe(canvas);
    window.addEventListener("resize", resize);
    motionQuery?.addEventListener("change", handleMotionChange);
    restartAnimation();

    return () => {
      window.cancelAnimationFrame(animationFrame);
      window.removeEventListener("resize", resize);
      motionQuery?.removeEventListener("change", handleMotionChange);
      resizeObserver?.disconnect();
      disposeScene(scene);
      renderer.dispose();
    };
  }, [particleColor]);

  return <canvas ref={canvasRef} className="absolute inset-0 size-full" data-chat-ambient-canvas />;
}
