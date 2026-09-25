// Etiqueta de bolsa com alça — Marketplace Studio Lab (modelo próprio).
// Usa lib/lab/scad/name-tag.scad (colado antes deste arquivo). O nome fica sobre uma base de contorno suave;
// de um lado sai uma alça fina e flexível com um furo na ponta e, perto da etiqueta, um pino de pressão:
// passe a alça em volta da alça da mochila e pressione o furo no pino.

/* [Alça] */
strap_side = "left"; // [left, right]
strap_length = 100; // from the tag's edge to the tip
strap_width = 9;
strap_thickness = 1.2;

/* [Fecho] */
pin_diameter = 3.2; // stem of the snap pin
pin_distance = 14; // from the tag's edge
snap_clearance = 0.3; // the hole is the stem plus this
snap_grip = 1.0; // how much wider the pin head is than the hole: more = firmer

dir = strap_side == "left" ? -1 : 1;
edge_x = strap_side == "left" ? X0 - border : X1 + border;
strap_y = (M[1] + M[3]) / 2;
strap_root = edge_x - dir * (border + strap_width); // starts under the tag, hidden by it
strap_tip = edge_x + dir * strap_length;
pin_x = edge_x + dir * pin_distance;
hole_d = pin_diameter + snap_clearance;
head_d = hole_d + snap_grip;

module strap2d() hull() {
  translate([strap_root, strap_y]) circle(d = strap_width);
  translate([strap_tip, strap_y]) circle(d = strap_width);
}

// Stem long enough for the other end of the strap, then a head that flares at 45° (prints without supports)
// and tapers to a point so the hole slides over it and snaps under the flare.
module snap_pin() translate([pin_x, strap_y, strap_thickness]) {
  stem = strap_thickness + 0.4;
  flare = (head_d - pin_diameter) / 2;
  cylinder(d = pin_diameter, h = stem);
  translate([0, 0, stem]) cylinder(d1 = pin_diameter, d2 = head_d, h = flare);
  translate([0, 0, stem + flare]) cylinder(d1 = head_d, d2 = pin_diameter * 0.6, h = 1.4);
}

tag_parts() tag_base() {
  union() {
    linear_extrude(strap_thickness) strap2d();
    snap_pin();
  }
  translate([strap_tip, strap_y, -1]) cylinder(d = hole_d, h = strap_thickness + 2);
}
