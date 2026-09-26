import { useEffect, useRef } from 'react';
import * as THREE from 'three';

// Renders as a small circle inside SiteHeader's .site-header__orb wrapper
// (position: relative; overflow hidden). Colors are hardcoded monochrome.

export default function HeroCanvas() {
  const mountRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!mountRef.current) return;
    const mount = mountRef.current;

    // ── Scene setup ──────────────────────────────────────────────
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(60, mount.clientWidth / mount.clientHeight, 0.1, 100);
    camera.position.z = 3;

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(mount.clientWidth, mount.clientHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setClearColor(0x000000, 0);
    mount.appendChild(renderer.domElement);

    // ── Particle grid ─────────────────────────────────────────────
    const GRID = 40;
    const COUNT = GRID * GRID;

    const positions = new Float32Array(COUNT * 3);
    const randoms = new Float32Array(COUNT);

    for (let i = 0; i < GRID; i++) {
      for (let j = 0; j < GRID; j++) {
        const idx = (i * GRID + j);
        positions[idx * 3 + 0] = (i / (GRID - 1) - 0.5) * 6;
        positions[idx * 3 + 1] = (j / (GRID - 1) - 0.5) * 6;
        positions[idx * 3 + 2] = 0;
        randoms[idx] = Math.random();
      }
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geo.setAttribute('aRandom', new THREE.BufferAttribute(randoms, 1));

    // ── Shader material ───────────────────────────────────────────
    const mat = new THREE.ShaderMaterial({
      transparent: true,
      uniforms: {
        uTime:   { value: 0 },
        uMouse:  { value: new THREE.Vector2(0, 0) },
        uAccent: { value: new THREE.Color('#ffffff') },
        uCool:   { value: new THREE.Color('#bbbbbb') },
      },
      vertexShader: `
        attribute float aRandom;
        uniform float uTime;
        uniform vec2 uMouse;

        varying float vStrength;
        varying float vRandom;

        void main() {
          vec3 pos = position;

          // Wave displacement
          float wave = sin(pos.x * 1.2 + uTime * 0.8) * 0.5
                     + sin(pos.y * 0.9 + uTime * 0.6) * 0.5;
          pos.z += wave * 0.12 * aRandom;

          // Mouse influence — pull toward cursor
          vec2 toMouse = uMouse - pos.xy;
          float dist = length(toMouse);
          float influence = smoothstep(1.8, 0.0, dist);
          pos.xy += toMouse * influence * 0.18;

          vStrength = influence;
          vRandom = aRandom;

          vec4 mvPos = modelViewMatrix * vec4(pos, 1.0);
          gl_PointSize = mix(2.0, 5.0, influence) * (2.5 / -mvPos.z);
          gl_Position = projectionMatrix * mvPos;
        }
      `,
      fragmentShader: `
        uniform vec3 uAccent;
        uniform vec3 uCool;
        varying float vStrength;
        varying float vRandom;

        void main() {
          // Circular point
          vec2 uv = gl_PointCoord - 0.5;
          float d = length(uv);
          if (d > 0.5) discard;

          // Color: cool base → hot accent near mouse
          vec3 col = mix(vec3(0.45), uCool, vStrength * 0.4);
          col = mix(col, uAccent, vStrength * vStrength * 0.9);

          float alpha = (1.0 - d * 2.0) * mix(0.2, 0.95, vStrength + 0.05);
          gl_FragColor = vec4(col, alpha);
        }
      `,
    });

    const points = new THREE.Points(geo, mat);
    scene.add(points);

    // ── Mouse tracking ────────────────────────────────────────────
    const mouse = new THREE.Vector2(99, 99);
    const targetMouse = new THREE.Vector2(99, 99);

    const onMouseMove = (e: MouseEvent) => {
      const rect = mount.getBoundingClientRect();
      const x = ((e.clientX - rect.left) / rect.width - 0.5) * 6;
      const y = -((e.clientY - rect.top) / rect.height - 0.5) * 6;
      targetMouse.set(x, y);
    };
    window.addEventListener('mousemove', onMouseMove);

    // ── Resize ────────────────────────────────────────────────────
    const onResize = () => {
      camera.aspect = mount.clientWidth / mount.clientHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(mount.clientWidth, mount.clientHeight);
    };
    window.addEventListener('resize', onResize);

    // ── Animation loop ────────────────────────────────────────────
    let raf: number;
    const clock = new THREE.Clock();

    const animate = () => {
      raf = requestAnimationFrame(animate);
      const t = clock.getElapsedTime();

      // Smooth mouse lerp
      mouse.lerp(targetMouse, 0.04);
      mat.uniforms.uTime.value = t;
      mat.uniforms.uMouse.value.copy(mouse);

      renderer.render(scene, camera);
    };
    animate();

    // ── Cleanup ───────────────────────────────────────────────────
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('resize', onResize);
      renderer.dispose();
      geo.dispose();
      mat.dispose();
      if (mount.contains(renderer.domElement)) {
        mount.removeChild(renderer.domElement);
      }
    };
  }, []);

  return (
    <div
      ref={mountRef}
      style={{
        position: 'absolute',
        inset: 0,
        width: '100%',
        height: '100%',
        pointerEvents: 'none',
      }}
    />
  );
}
