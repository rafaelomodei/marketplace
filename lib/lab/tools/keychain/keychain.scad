// Chaveiro com nome — Marketplace Studio Lab (modelo próprio).
// Usa lib/lab/scad/name-tag.scad (colado antes deste arquivo). Até quatro peças, uma por cor:
// a base (contorno + argola), o nome, o texto de cima e o ícone.

/* [Argola] */
ring = "left"; // [left, right, top, none]
ring_diameter = 9;
hole_diameter = 4.5;
ring_offset_y = 0;

// --- Ring: at the start, at the end, or centered on top. The hole sits close to the letters,
// keeping ring_clearance of base between the hole and the nearest letter.
ring_clearance = 1.2;
hole_r = hole_diameter / 2;
upper = has_top ? T : M; // the line the top ring sits on
ring_x = ring == "left" ? X0 - ring_clearance - hole_r
  : ring == "right" ? X1 + ring_clearance + hole_r
  : min(max((X0 + X1) / 2, upper[0] + ring_diameter / 2), upper[2] - ring_diameter / 2);
ring_y = ring == "top" ? upper[3] + ring_clearance + hole_r + ring_offset_y
  : (M[1] + M[3]) / 2 + ring_offset_y;
// The tab is a capsule from the ring into the base, so it always joins the contour.
bridge = ring == "left" ? [ring_x + ring_diameter * 0.7, ring_y]
  : ring == "right" ? [ring_x - ring_diameter * 0.7, ring_y]
  : [ring_x, ring_y - ring_diameter * 0.7];

module ring_tab() hull() {
  translate([ring_x, ring_y]) circle(d = ring_diameter);
  translate(bridge) circle(d = ring_diameter * 0.8);
}

tag_parts() tag_base() {
  if (ring != "none") linear_extrude(base_thickness) ring_tab();
  if (ring != "none") translate([ring_x, ring_y, -1]) cylinder(d = hole_diameter, h = base_thickness + 2);
}
