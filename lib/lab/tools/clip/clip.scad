// Enfeite para clipe — Marketplace Studio Lab (modelo próprio).
// Usa lib/lab/scad/svg-relief.scad (colado antes deste arquivo): o desenho em camadas de cor sobre a base.
// Por dentro da base, aberta na borda de baixo, fica a fenda onde entra a ponta do clipe.
// O retângulo da fenda (slot_x0, slot_x1, slot_y0, slot_y1) e o clipe virtual (clip_path, clip_wire) vêm
// calculados de lib/lab/tools/clip/index.ts, junto com o desenho.

/* [Encaixe do clipe] */
slot_height = 1; // wire thickness + a little play

slot_z = (base_thickness - slot_height) / 2; // centered in the base

module clip_slot() translate([slot_x0, slot_y0, slot_z]) cube([slot_x1 - slot_x0, slot_y1 - slot_y0, slot_height]);

// Preview only: the wire's centerline as a chain of capsules, lying in the slot.
module paper_clip() translate([0, 0, slot_z + slot_height / 2])
  for (i = [0 : len(clip_path) - 2]) hull() {
    translate(clip_path[i]) sphere(d = clip_wire, $fn = 12);
    translate(clip_path[i + 1]) sphere(d = clip_wire, $fn = 12);
  }

relief_parts() {
  union() {}
  clip_slot();
}
if (part == "clip") color("rosybrown") paper_clip();
