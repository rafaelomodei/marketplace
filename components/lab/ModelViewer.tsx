"use client";

import { Scan } from "lucide-react";
import { useEffect, useRef } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { Icon } from "@/components/ui";
import { cn } from "@/lib/cn";

/** `lift` raises a part (mm) — used to show separate pieces above their pockets. */
export type ViewerPart = { id: string; soup: Float32Array; color: string; lift?: number };

type Stage = {
  renderer: THREE.WebGLRenderer;
  camera: THREE.PerspectiveCamera;
  controls: OrbitControls;
  group: THREE.Group;
  meshes: Map<string, THREE.Mesh<THREE.BufferGeometry, THREE.MeshStandardMaterial>>;
  fittedSize: number;
};

/** Interactive 3D preview (drag to rotate, scroll to zoom). Models are Z-up in mm, like OpenSCAD. */
export function ModelViewer({ parts, className, children }: { parts: ViewerPart[]; className?: string; children?: React.ReactNode }) {
  const host = useRef<HTMLDivElement>(null);
  const stage = useRef<Stage | null>(null);

  useEffect(() => {
    const el = host.current!;
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    // Neutral keeps filament colors close to the real spool (ACES would wash them out).
    renderer.toneMapping = THREE.NeutralToneMapping;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    el.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    scene.add(new THREE.HemisphereLight(0xffffff, 0xd9cdf0, 1.6));
    const key = new THREE.DirectionalLight(0xffffff, 2.2);
    key.position.set(-40, 80, 60);
    scene.add(key);
    const rim = new THREE.DirectionalLight(0xfbc59e, 0.9);
    rim.position.set(60, 20, -60);
    scene.add(rim);

    const group = new THREE.Group();
    group.rotation.x = -Math.PI / 2; // OpenSCAD is Z-up
    scene.add(group);

    const camera = new THREE.PerspectiveCamera(35, 1, 0.1, 5000);
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;

    const resize = () => {
      const { clientWidth: w, clientHeight: h } = el;
      renderer.setSize(w, h, false);
      renderer.domElement.style.width = "100%";
      renderer.domElement.style.height = "100%";
      camera.aspect = w / Math.max(h, 1);
      camera.updateProjectionMatrix();
    };
    const ro = new ResizeObserver(resize);
    ro.observe(el);
    resize();

    renderer.setAnimationLoop(() => {
      controls.update();
      renderer.render(scene, camera);
    });
    stage.current = { renderer, camera, controls, group, meshes: new Map(), fittedSize: 0 };

    return () => {
      ro.disconnect();
      renderer.setAnimationLoop(null);
      controls.dispose();
      for (const m of stage.current?.meshes.values() ?? []) {
        m.geometry.dispose();
        m.material.dispose();
      }
      renderer.dispose();
      renderer.domElement.remove();
      stage.current = null;
    };
  }, []);

  useEffect(() => {
    const s = stage.current;
    if (!s) return;
    const ids = new Set(parts.map((p) => p.id));
    for (const [id, mesh] of s.meshes)
      if (!ids.has(id)) {
        s.group.remove(mesh);
        mesh.geometry.dispose();
        mesh.material.dispose();
        s.meshes.delete(id);
      }
    for (const p of parts) {
      let mesh = s.meshes.get(p.id);
      if (!mesh) {
        mesh = new THREE.Mesh(new THREE.BufferGeometry(), new THREE.MeshStandardMaterial({ roughness: 0.55, metalness: 0.02 }));
        s.meshes.set(p.id, mesh);
        s.group.add(mesh);
      }
      if (mesh.userData.soup !== p.soup) {
        mesh.geometry.dispose();
        const g = new THREE.BufferGeometry();
        g.setAttribute("position", new THREE.BufferAttribute(p.soup, 3));
        g.computeVertexNormals();
        mesh.geometry = g;
        mesh.userData.soup = p.soup;
      }
      mesh.material.color.set(p.color);
      mesh.position.z = p.lift ?? 0; // the group is Z-up like OpenSCAD
    }
    // Re-frame when the model no longer fits the view or got much smaller; keep the user's view otherwise.
    const box = new THREE.Box3().setFromObject(s.group);
    const size = box.getSize(new THREE.Vector3()).length();
    if (size && (!s.fittedSize || size < s.fittedSize * 0.7 || !inView(s.camera, box))) fit(s);
  }, [parts]);

  return (
    <div className={cn("relative overflow-hidden", className)}>
      <div ref={host} className="absolute inset-0 cursor-grab active:cursor-grabbing" />
      {children}
      <button
        type="button"
        title="Centralizar"
        aria-label="Centralizar"
        onClick={() => stage.current && fit(stage.current)}
        className="absolute right-3 bottom-3 grid size-9 place-items-center rounded-full bg-canvas/85 text-ink-strong shadow-float ring-1 ring-black/5 backdrop-blur"
      >
        <Icon icon={Scan} />
      </button>
    </div>
  );
}

/** True when every corner of the box projects inside the frame (with a small margin). */
function inView(camera: THREE.PerspectiveCamera, box: THREE.Box3) {
  camera.updateMatrixWorld();
  const { min, max } = box;
  for (const x of [min.x, max.x])
    for (const y of [min.y, max.y])
      for (const z of [min.z, max.z]) {
        const p = new THREE.Vector3(x, y, z).project(camera);
        if (Math.abs(p.x) > 0.95 || Math.abs(p.y) > 0.95 || p.z > 1) return false;
      }
  return true;
}

/** Points the camera at the model from the front, slightly above, so the letters read. */
function fit(s: Stage) {
  const box = new THREE.Box3().setFromObject(s.group);
  if (box.isEmpty()) return;
  const center = box.getCenter(new THREE.Vector3());
  const size = box.getSize(new THREE.Vector3());
  const radius = size.length() / 2;
  // Fit the bounding sphere in both directions (long names are limited by the width).
  const vFov = THREE.MathUtils.degToRad(s.camera.fov);
  const hFov = 2 * Math.atan(Math.tan(vFov / 2) * s.camera.aspect);
  const dist = (radius / Math.sin(Math.min(vFov, hFov) / 2)) * 0.8;
  s.camera.position.set(center.x, center.y + dist * 0.75, center.z + dist * 0.65);
  s.camera.near = dist / 100;
  s.camera.far = dist * 20;
  s.camera.updateProjectionMatrix();
  s.controls.target.copy(center);
  s.controls.update();
  s.fittedSize = size.length();
}
