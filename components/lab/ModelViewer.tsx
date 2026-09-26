"use client";

import { Scan } from "lucide-react";
import { useEffect, useImperativeHandle, useRef } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { Icon } from "@/components/ui";
import { cn } from "@/lib/cn";

/**
 * `lift` raises a part (mm) — used to show separate pieces above their pockets. `offset` shifts it on the table (mm),
 * e.g. a dragged part while its new position renders.
 */
export type ViewerPart = { id: string; soup: Float32Array; color: string; lift?: number; offset?: [number, number] };
/** Outline drawn over the model (e.g. the selected shapes), in model mm at height z. */
export type ViewerOutline = { rings: [number, number][][]; z: number };
/** Where a click landed: the part and the point in model mm (Z up). */
export type ViewerHit = { part: string; point: [number, number, number] };
export type ViewerHandle = {
  fit: () => void;
  zoom: (factor: number) => void;
  /** 3D only: picture of the current view (WebP data URL, at most `width` px wide), e.g. the thumbnail of a saved creation. */
  snapshot?: (width?: number) => string | null;
};

type Stage = {
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  controls: OrbitControls;
  group: THREE.Group;
  meshes: Map<string, THREE.Mesh<THREE.BufferGeometry, THREE.MeshStandardMaterial>>;
  outlines: THREE.Group;
  grid: THREE.GridHelper | null;
  fittedSize: number;
};

/** A design token (CSS variable) as a three.js color, so the 3D view follows the design system. */
const token = (el: Element, name: string) => new THREE.Color(getComputedStyle(el).getPropertyValue(name).trim() || "#000000");

/**
 * Interactive 3D preview (drag to rotate, scroll to zoom). Models are Z-up in mm, like OpenSCAD.
 * Optional: click picking (`onPick`), outlines of a selection, a floor grid, zoom/fit through `handle`, and parts that
 * can be dragged on the table (`draggable` + `onDrag`: the pointer shows "move" over them and the camera stays put;
 * `delta` is in mm from where the drag started, `done` on release).
 */
export function ModelViewer({
  parts,
  className,
  children,
  onPick,
  outlines,
  grid,
  handle,
  showFit = true,
  draggable,
  onDrag,
}: {
  parts: ViewerPart[];
  className?: string;
  children?: React.ReactNode;
  onPick?: (hit: ViewerHit | null) => void;
  outlines?: ViewerOutline[];
  grid?: boolean;
  handle?: React.Ref<ViewerHandle>;
  showFit?: boolean;
  draggable?: string[];
  onDrag?: (part: string, delta: [number, number], done: boolean) => void;
}) {
  const host = useRef<HTMLDivElement>(null);
  const stage = useRef<Stage | null>(null);
  const pick = useRef(onPick);
  pick.current = onPick;
  const drag = useRef({ draggable, onDrag });
  drag.current = { draggable, onDrag };

  useImperativeHandle(handle, () => ({
    fit: () => stage.current && fit(stage.current),
    zoom: (factor) => {
      const s = stage.current;
      if (!s) return;
      const offset = s.camera.position.clone().sub(s.controls.target).multiplyScalar(factor);
      s.camera.position.copy(s.controls.target).add(offset);
      s.controls.update();
    },
    snapshot: (width = 480) => {
      const s = stage.current;
      if (!s || !s.meshes.size) return null;
      // Just the piece (no floor grid, no selection), read right after drawing: WebGL clears the buffer once the frame is shown.
      const helpers = [s.grid, s.outlines].filter((o) => o?.visible) as THREE.Object3D[];
      for (const o of helpers) o.visible = false;
      s.renderer.render(s.scene, s.camera);
      for (const o of helpers) o.visible = true;
      const src = s.renderer.domElement;
      if (!src.width || !src.height) return null;
      const scale = Math.min(1, width / src.width);
      const out = Object.assign(document.createElement("canvas"), { width: Math.round(src.width * scale), height: Math.round(src.height * scale) });
      out.getContext("2d")!.drawImage(src, 0, 0, out.width, out.height);
      return out.toDataURL("image/webp", 0.85);
    },
  }));

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
    const outlineGroup = new THREE.Group();
    group.add(outlineGroup);

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

    const rayAt = (e: PointerEvent) => {
      const r = renderer.domElement.getBoundingClientRect();
      const ray = new THREE.Raycaster();
      ray.setFromCamera(new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1), camera);
      return ray;
    };
    const hitAt = (e: PointerEvent) => rayAt(e).intersectObjects([...(stage.current?.meshes.values() ?? [])], false)[0];
    /**
     * The draggable part under the pointer. Thin parts (a clip's wire) are hard to hit, so the grab area is the part's
     * whole outline on the table (its box, a bit taller than the piece) — also where it goes into the piece.
     */
    const grabAt = (e: PointerEvent): { part: string; point: THREE.Vector3 } | null => {
      const { draggable, onDrag } = drag.current;
      if (!onDrag || !draggable?.length) return null;
      const ray = rayAt(e).ray;
      let best: { part: string; point: THREE.Vector3; d: number } | null = null;
      for (const id of draggable) {
        const mesh = stage.current?.meshes.get(id);
        if (!mesh) continue;
        const g = mesh.geometry;
        if (!g.boundingBox) g.computeBoundingBox();
        const box = g.boundingBox!.clone().expandByVector(new THREE.Vector3(1, 1, 3));
        const local = ray.clone().applyMatrix4(mesh.matrixWorld.clone().invert());
        const at = local.intersectBox(box, new THREE.Vector3());
        if (!at) continue;
        const point = at.applyMatrix4(mesh.matrixWorld);
        const d = point.distanceTo(ray.origin);
        if (!best || d < best.d) best = { part: id, point, d };
      }
      return best;
    };

    // Dragging a draggable part: it slides on the table plane (at the height it was grabbed), never up or down.
    let moving: { part: string; plane: THREE.Plane; from: THREE.Vector3; last: [number, number] } | null = null;
    const onGrab = (e: PointerEvent) => {
      const hit = grabAt(e);
      if (!hit) return;
      const up = new THREE.Vector3(0, 0, 1).applyQuaternion(group.quaternion);
      moving = { part: hit.part, plane: new THREE.Plane().setFromNormalAndCoplanarPoint(up, hit.point), from: group.worldToLocal(hit.point.clone()), last: [0, 0] };
      controls.enabled = false; // runs before OrbitControls (capture), so the camera does not turn
      renderer.domElement.setPointerCapture(e.pointerId);
    };
    const onMove = (e: PointerEvent) => {
      if (!moving) {
        // Hover: "move" over what can be dragged.
        if (e.buttons === 0) renderer.domElement.style.cursor = grabAt(e) ? "move" : "";
        return;
      }
      const at = rayAt(e).ray.intersectPlane(moving.plane, new THREE.Vector3());
      if (!at) return;
      const p = group.worldToLocal(at);
      moving.last = [p.x - moving.from.x, p.y - moving.from.y];
      drag.current.onDrag?.(moving.part, moving.last, false);
    };
    const onRelease = () => {
      if (!moving) return;
      drag.current.onDrag?.(moving.part, moving.last, true);
      moving = null;
      controls.enabled = true;
    };

    // A click (not a drag to rotate) picks the part under the pointer.
    let down: { x: number; y: number } | null = null;
    const onDown = (e: PointerEvent) => (down = { x: e.clientX, y: e.clientY });
    const onUp = (e: PointerEvent) => {
      if (!down || !pick.current || Math.hypot(e.clientX - down.x, e.clientY - down.y) > 4) return;
      const hit = hitAt(e);
      if (!hit) return pick.current(null);
      const p = group.worldToLocal(hit.point.clone());
      pick.current({ part: hit.object.userData.id, point: [p.x, p.y, p.z - (hit.object.position.z ?? 0)] });
    };
    renderer.domElement.addEventListener("pointerdown", onGrab, { capture: true });
    renderer.domElement.addEventListener("pointermove", onMove);
    renderer.domElement.addEventListener("pointerup", onRelease);
    renderer.domElement.addEventListener("pointercancel", onRelease);
    renderer.domElement.addEventListener("pointerdown", onDown);
    renderer.domElement.addEventListener("pointerup", onUp);

    renderer.setAnimationLoop(() => {
      controls.update();
      renderer.render(scene, camera);
    });
    stage.current = { renderer, scene, camera, controls, group, meshes: new Map(), outlines: outlineGroup, grid: null, fittedSize: 0 };

    return () => {
      ro.disconnect();
      renderer.domElement.removeEventListener("pointerdown", onGrab, { capture: true });
      renderer.domElement.removeEventListener("pointermove", onMove);
      renderer.domElement.removeEventListener("pointerup", onRelease);
      renderer.domElement.removeEventListener("pointercancel", onRelease);
      renderer.domElement.removeEventListener("pointerdown", onDown);
      renderer.domElement.removeEventListener("pointerup", onUp);
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
        mesh.userData.id = p.id;
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
      mesh.position.set(p.offset?.[0] ?? 0, p.offset?.[1] ?? 0, p.lift ?? 0); // the group is Z-up like OpenSCAD
    }
    // Re-frame when the model no longer fits the view or got much smaller; keep the user's view otherwise.
    // Parts people drag (the clip) may go out of view without moving the camera: they were put there on purpose.
    const box = new THREE.Box3();
    const piece = new THREE.Box3();
    for (const [id, m] of s.meshes) {
      box.expandByObject(m);
      if (!draggable?.includes(id)) piece.expandByObject(m);
    }
    const size = box.getSize(new THREE.Vector3()).length();
    const shifted = parts.some((p) => p.offset?.[0] || p.offset?.[1]); // being dragged: keep the view still
    if (size && !shifted && (!s.fittedSize || size < s.fittedSize * 0.7 || !inView(s.camera, piece.isEmpty() ? box : piece))) fit(s);
    // No floor grid in the gallery pictures (scripts/lab-previews.mjs opens the editor with ?foto).
    if (grid && !new URLSearchParams(window.location.search).has("foto")) placeGrid(s, box, host.current!);
  }, [parts, grid]);

  useEffect(() => {
    const s = stage.current;
    if (!s) return;
    for (const c of [...s.outlines.children]) {
      s.outlines.remove(c);
      (c as THREE.LineLoop).geometry.dispose();
    }
    const material = new THREE.LineBasicMaterial({ color: token(host.current!, "--color-ink-strong"), depthTest: false, transparent: true });
    for (const o of outlines ?? [])
      for (const r of o.rings) {
        const g = new THREE.BufferGeometry().setFromPoints(r.map(([x, y]) => new THREE.Vector3(x, y, o.z + 0.02)));
        const line = new THREE.LineLoop(g, material);
        line.renderOrder = 10;
        s.outlines.add(line);
      }
  }, [outlines]);

  return (
    // data-lab-viewer: scripts/lab-previews.mjs finds the 3D here to take the gallery pictures.
    <div data-lab-viewer className={cn("relative overflow-hidden", className)}>
      <div ref={host} className="absolute inset-0 cursor-grab active:cursor-grabbing" />
      {children}
      {showFit && (
        <button
          type="button"
          title="Centralizar"
          aria-label="Centralizar"
          onClick={() => stage.current && fit(stage.current)}
          className="absolute right-3 bottom-3 grid size-9 place-items-center rounded-full bg-canvas/85 text-ink-strong shadow-float ring-1 ring-black/5 backdrop-blur"
        >
          <Icon icon={Scan} />
        </button>
      )}
    </div>
  );
}

/** Floor grid (1 cm squares) under the model, sized to it. */
function placeGrid(s: Stage, box: THREE.Box3, el: Element) {
  if (box.isEmpty()) return;
  const size = box.getSize(new THREE.Vector3());
  const span = Math.max(100, Math.ceil((Math.max(size.x, size.z) * 3) / 20) * 20);
  if (s.grid?.userData.span !== span) {
    if (s.grid) s.grid.parent?.remove(s.grid);
    s.grid?.geometry.dispose();
    const grid = new THREE.GridHelper(span, span / 10, token(el, "--color-line-strong"), token(el, "--color-line"));
    grid.userData.span = span;
    s.group.parent!.add(grid);
    s.grid = grid;
  }
  const c = box.getCenter(new THREE.Vector3());
  s.grid!.position.set(c.x, box.min.y - 0.01, c.z);
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
  const box = new THREE.Box3();
  for (const m of s.meshes.values()) box.expandByObject(m);
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
