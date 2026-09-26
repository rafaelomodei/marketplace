/** Lab SVG editor core: read an SVG, one layer per color with its height, OpenSCAD code for the relief. */
export { colorDistance, parseColor } from "./color";
export {
  adjustLayer,
  adjustShapes,
  artOf,
  bottomAt,
  designShapes,
  designLayers,
  DETAIL_HEIGHT,
  layerId,
  layoutDesign,
  MAIN_HEIGHT,
  MAX_SHAPES,
  readDesign,
  ringsPath,
  shapeAt,
  solidAt,
  solidNear,
  writeDesign,
  type DesignShape,
  type LayerSettings,
  type ShapeSettings,
  type SvgDesign,
  type SvgLayer,
  type SvgLayout,
} from "./design";
export type { Pt, Ring } from "./geometry";
export { parseSvg, type SvgArt, type SvgColor, type SvgShape } from "./parse";
export { designScad } from "./scad";
