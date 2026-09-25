// Nome em relevo sobre uma base de contorno suave — biblioteca compartilhada pelas ferramentas do Lab
// (chaveiro, etiqueta de bolsa…). Cada ferramenta acrescenta a sua parte (argola, alça) e chama:
//   tag_parts() tag_base() { <extras somados à base>; <furos>; }
// Marketplace Studio Lab — modelo próprio.

/* [Nome] */
text = "Amália";
font = "Pacifico";
text_size = 14;
spacing = 1.0;

/* [Texto de cima] */
top_text = "";
top_font = "Satisfy";
top_size = 7;
top_align = "center"; // [left, center, right]
line_gap = -1.5;

/* [Ícone] */
icon_code = 0; // Font Awesome codepoint; 0 = no icon
icon_position = "after"; // [after, before]
icon_size = 9;
icon_offset_y = -2;

/* [Espessuras] */
base_thickness = 3;
text_thickness = 1.6;

/* [Contorno] */
border = 2.4;
smooth = 2.5;

/* [Impressão em uma cor: peças de encaixe] */
// 1 = the part is printed on its own and the base gets a shallow pocket where it fits.
sep_text = 0;
sep_top = 0;
sep_icon = 0;
fit_clearance = 0.2; // gap on each side between the piece and its pocket
pocket_depth = 1;

/* [Saída] */
part = "all"; // [all, base, text, top, icon]

ICON_FONT = "Font Awesome 6 Free:style=Solid";
$fn = 48;

has_top = len(top_text) > 0;
has_icon = icon_code > 0;

// Ink boxes: [x0, y0, x1, y1] of each element once placed.
function box(m, t = [0, 0]) = [m.position[0] + t[0], m.position[1] + t[1], m.position[0] + m.size[0] + t[0], m.position[1] + m.size[1] + t[1]];

// Ink box of each letter of a line placed like its metrics m (halign/valign "center"), moved by t.
// Each letter is measured alone and placed at the advance of the text before it; spaces are skipped.
function prefix(s, n) = n <= 0 ? "" : str(prefix(s, n - 1), s[n - 1]);
function glyph_boxes(s, size, f, m, t = [0, 0]) = let(
  base = textmetrics(s, size = size, font = f, spacing = spacing),
  d = [m.position[0] - base.position[0] + t[0], m.position[1] - base.position[1] + t[1]]
) [for (i = [0 : len(s) - 1]) let(
    g = textmetrics(s[i], size = size, font = f, spacing = spacing),
    x = i == 0 ? 0 : textmetrics(prefix(s, i), size = size, font = f, spacing = spacing).advance[0]
  ) if (g.size[0] > 0) box(g, [x + d[0], d[1]])];

// --- Main name, centered on the origin.
main_m = textmetrics(text, size = text_size, font = font, spacing = spacing, halign = "center", valign = "center");
M = box(main_m);

// --- Top line: aligned to the name's left, center or right, sitting on top of it (negative gap = overlap).
top_m = has_top ? textmetrics(top_text, size = top_size, font = top_font, spacing = spacing, halign = "center", valign = "center") : undef;
top_tx = !has_top ? 0
  : top_align == "left" ? M[0] - top_m.position[0]
  : top_align == "right" ? M[2] - (top_m.position[0] + top_m.size[0])
  : (M[0] + M[2]) / 2 - (top_m.position[0] + top_m.size[0] / 2);
top_ty = has_top ? M[3] + line_gap - top_m.position[1] : 0;
T = has_top ? box(top_m, [top_tx, top_ty]) : M;

// --- Icon: the glyph is scaled so its largest side equals icon_size.
icon_probe = has_icon ? textmetrics(chr(icon_code), size = 10, font = ICON_FONT, halign = "center", valign = "center") : undef;
icon_font_size = has_icon ? 10 * icon_size / max(icon_probe.size[0], icon_probe.size[1]) : 0;
icon_m = has_icon ? textmetrics(chr(icon_code), size = icon_font_size, font = ICON_FONT, halign = "center", valign = "center") : undef;
icon_gap = text_size * 0.12;
icon_ty = has_icon ? (M[1] + M[3]) / 2 - (icon_m.position[1] + icon_m.size[1] / 2) + icon_offset_y : 0;
// The icon hugs the letters at its own height: moved up or down, it slides sideways until it meets
// the nearest letter (of the name or the top line) at its height — or within the contour's reach of it —
// so it stays joined to the text instead of floating beside the name's overall box.
icon_y0 = has_icon ? icon_m.position[1] + icon_ty : 0;
icon_y1 = has_icon ? icon_y0 + icon_m.size[1] : 0;
beside = has_icon ? [for (g = concat(glyph_boxes(text, text_size, font, main_m), has_top ? glyph_boxes(top_text, top_size, top_font, top_m, [top_tx, top_ty]) : []))
  if (g[1] < icon_y1 + border && g[3] > icon_y0 - border) g] : [];
edge = icon_position == "before" ? (len(beside) > 0 ? min([for (g = beside) g[0]]) : min(M[0], T[0]))
  : (len(beside) > 0 ? max([for (g = beside) g[2]]) : max(M[2], T[2]));
icon_tx = !has_icon ? 0
  : icon_position == "before" ? edge - icon_gap - (icon_m.position[0] + icon_m.size[0])
  : edge + icon_gap - icon_m.position[0];
I = has_icon ? box(icon_m, [icon_tx, icon_ty]) : M;

// --- Whole design.
X0 = min(M[0], T[0], I[0]);
X1 = max(M[2], T[2], I[2]);
Y1 = max(M[3], T[3], I[3]);

module name2d() text(text, size = text_size, font = font, spacing = spacing, halign = "center", valign = "center");
module top2d() if (has_top) translate([top_tx, top_ty]) text(top_text, size = top_size, font = top_font, spacing = spacing, halign = "center", valign = "center");
module icon2d() if (has_icon) translate([icon_tx, icon_ty]) text(chr(icon_code), size = icon_font_size, font = ICON_FONT, halign = "center", valign = "center");

// Fills the space between the two lines wherever they overlap horizontally (from the middle of the name
// up to the middle of the top line), so the base never has a gap between them whatever the letters' heights.
// Beyond the overlap the contour keeps a rounded step, like a hand-drawn tag.
fill_x0 = max(T[0], M[0]);
fill_x1 = min(T[2], M[2]);
fill_y0 = (M[1] + M[3]) / 2;
fill_y1 = (T[1] + T[3]) / 2;
module between_lines() if (has_top && fill_x1 > fill_x0 && fill_y1 > fill_y0)
  translate([fill_x0, fill_y0]) square([fill_x1 - fill_x0, fill_y1 - fill_y0]);

// Smooth contour around everything; the inner offset closes small gaps between letters and lines,
// and fill() removes every hole so the base is solid (letter counters, the space between the lines).
module outline() fill() offset(r = -smooth) offset(r = border + smooth) union() {
  name2d();
  top2d();
  icon2d();
  between_lines();
}

// Pockets for the pieces printed separately: their exact outline plus the fit clearance.
module pocket() translate([0, 0, base_thickness - pocket_depth]) linear_extrude(pocket_depth + 1) offset(r = fit_clearance) children();

// The tag base: the contour plate, plus the tool's extras (children(0), e.g. a ring or a strap),
// minus the tool's holes (children(1)) and the pockets of the pieces printed separately.
module tag_base() difference() {
  union() {
    linear_extrude(base_thickness) outline();
    if ($children > 0) children(0);
  }
  if ($children > 1) children(1);
  if (sep_text) pocket() name2d();
  if (sep_top) pocket() top_part();
  if (sep_icon) pocket() icon_part();
}

// Raised on the base; a separate piece also fills its pocket, so it ends at the same height once fitted.
module raised(separate = 0) {
  z = separate ? base_thickness - pocket_depth : base_thickness;
  translate([0, 0, z]) linear_extrude(text_thickness + (separate ? pocket_depth : 0)) children();
}

// Colored parts never overlap (a slicer could not tell which filament goes there):
// the name wins, the top line gives way to it, the icon gives way to both.
module top_part() difference() { top2d(); offset(r = 0.4) name2d(); }
module icon_part() difference() { icon2d(); offset(r = 0.4) union() { name2d(); top2d(); } }


// Renders the requested part: the base (the child, usually tag_base()) or one of the raised pieces.
module tag_parts() {
  if (part == "all" || part == "base") color("white") children();
  if (part == "all" || part == "text") color("mediumpurple") raised(sep_text) name2d();
  if (part == "all" || part == "top") color("tan") raised(sep_top) top_part();
  if (part == "all" || part == "icon") color("hotpink") raised(sep_icon) icon_part();
}
