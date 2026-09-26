// Desenho em camadas de cor sobre uma base — biblioteca compartilhada pelas ferramentas do Lab que partem de um SVG
// (clipe decorado…). O código do desenho (svg_ids, svg_heights, svg_all, svg_solid) é gerado por lib/lab/svg/scad.ts
// e colado antes deste arquivo. Cada ferramenta acrescenta a sua parte e chama:
//   relief_parts() { <extras somados à base>; <furos que cortam todas as peças>; }
// Marketplace Studio Lab — modelo próprio.

/* [Base] */
base_thickness = 3;
border = 1; // extra base around the drawing
inlay = 0.6; // how deep the colors go into the base (0 = colors only on top)

/* [Saída] */
part = "all"; // "all", "base" or one of svg_ids

$fn = 32;

// The base follows the drawing's silhouette, grown by the border (rounded corners).
module relief_outline() if (border > 0) offset(r = border) svg_all(); else svg_all();

// Color i: from inside the base (inlay) up to each shape's relief height; nothing when both are zero.
function layer_exists(i) = inlay + svg_heights[i] > 0.001;
module relief_layer(i) translate([0, 0, base_thickness - inlay]) svg_solid(i);

// Renders the requested part. children(0): extras added to the base; children(1): holes cut from every part.
module relief_parts() {
  if (part == "all" || part == "base") color("white") difference() {
    union() {
      linear_extrude(base_thickness) relief_outline();
      children(0);
    }
    children(1);
    // Room for the colors that sit inside the base.
    if (inlay > 0) translate([0, 0, base_thickness - inlay]) linear_extrude(inlay + 1) svg_all();
  }
  if (len(svg_ids) > 0) for (i = [0 : len(svg_ids) - 1]) if ((part == "all" || part == svg_ids[i]) && layer_exists(i))
    difference() {
      relief_layer(i);
      children(1);
    }
}
