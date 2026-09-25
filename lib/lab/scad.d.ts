/** OpenSCAD models are imported as text (webpack asset/source, vitest plugin). */
declare module "*.scad" {
  const source: string;
  export default source;
}
