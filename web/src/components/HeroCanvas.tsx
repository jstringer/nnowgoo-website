import { useEffect, useRef } from 'react';
import * as THREE from 'three';

// Full-viewport background for the Home page. Mount it inside a
// position: fixed; inset: 0 wrapper (see index.astro). The point grid is
// rebuilt on resize so it always covers the viewport with uniform spacing.
// Colors are hardcoded monochrome.

const FOV = 60;
const CAMERA_Z = 3;
const CELL = 0.11; // world-unit spacing between points
const MOUSE_RADIUS = 0.8; // world-unit radius of the cursor's influence

export default function HeroCanvas() {
  const mountRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!mountRef.current) return;
    const mount = mountRef.current;

    // ── Scene setup ──────────────────────────────────────────────
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(
      FOV,
      mount.clientWidth / mount.clientHeight,
      0.1,
      100,
    );
    camera.position.z = CAMERA_Z;

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(mount.clientWidth, mount.clientHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setClearColor(0x000000, 0);
    mount.appendChild(renderer.domElement);

    // Visible world size at z = 0
    const visibleHeight = () => 2 * CAMERA_Z * Math.tan((FOV * Math.PI) / 360);
    let visH = visibleHeight();
    let visW = visH * camera.aspect;

    // ── Shader material ───────────────────────────────────────────
    const mat = new THREE.ShaderMaterial({
      transparent: true,
      uniforms: {
        uTime: { value: 0 },
        uMouse: { value: new THREE.Vector2(0, 0) },
        uRadius: { value: MOUSE_RADIUS },
        uAccent: { value: new THREE.Color('#ffffff') },
        uCool: { value: new THREE.Color('#bbbbbb') },
      },
      vertexShader: `
        attribute float aRandom;
        uniform float uTime;claude --resume 9be65054-fb54-4a01-bfee-4386cab38a98
        uniform vec2 uMouse;
        uniform float uRadius;

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
          float influence = smoothstep(uRadius, 0.0, dist);
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

    // ── Particle grid (rebuilt on resize) ─────────────────────────
    let geo: THREE.BufferGeometry | null = null;
    let points: THREE.Points | null = null;

    const buildGrid = () => {
      if (points) scene.remove(points);
      geo?.dispose();

      // Overscan slightly so edge points never pop in when the mouse pulls them
      const cols = Math.ceil(visW / CELL) + 2;
      const rows = Math.ceil(visH / CELL) + 2;
      const count = cols * rows;

      const positions = new Float32Array(count * 3);
      const randoms = new Float32Array(count);

      for (let i = 0; i < cols; i++) {
        for (let j = 0; j < rows; j++) {
          const idx = i * rows + j;
          positions[idx * 3 + 0] = (i - (cols - 1) / 2) * CELL;
          positions[idx * 3 + 1] = (j - (rows - 1) / 2) * CELL;
          positions[idx * 3 + 2] = 0;
          randoms[idx] = Math.random();
        }
      }

      geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
      geo.setAttribute('aRandom', new THREE.BufferAttribute(randoms, 1));

      points = new THREE.Points(geo, mat);
      scene.add(points);
    };
    buildGrid();

    // ── Mouse tracking (window coords → world coords at z = 0) ────
    const mouse = new THREE.Vector2(99, 99);
    const targetMouse = new THREE.Vector2(99, 99);

    const onMouseMove = (e: MouseEvent) => {
      const rect = mount.getBoundingClientRect();
      const x = ((e.clientX - rect.left) / rect.width - 0.5) * visW;
      const y = -((e.clientY - rect.top) / rect.height - 0.5) * visH;
      targetMouse.set(x, y);
    };
    window.addEventListener('mousemove', onMouseMove);

    // ── Resize ────────────────────────────────────────────────────
    const onResize = () => {
      const w = mount.clientWidth;
      const h = mount.clientHeight;
      if (!w || !h) return;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
      visH = visibleHeight();
      visW = visH * camera.aspect;
      buildGrid();
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
      geo?.dispose();
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
