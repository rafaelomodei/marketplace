/** Fonts available to Lab tools. Files live in public/lab/fonts/ (pnpm lab:fonts), all free for commercial use. */
export type LabFont = { family: string; file: string; style: "Cursiva" | "Arredondada" | "Marcante" };

export const LAB_FONTS: LabFont[] = [
  { family: "Pacifico", file: "Pacifico-Regular.ttf", style: "Cursiva" },
  { family: "Lobster", file: "Lobster-Regular.ttf", style: "Cursiva" },
  { family: "Leckerli One", file: "LeckerliOne-Regular.ttf", style: "Cursiva" },
  { family: "Kaushan Script", file: "KaushanScript-Regular.ttf", style: "Cursiva" },
  { family: "Grand Hotel", file: "GrandHotel-Regular.ttf", style: "Cursiva" },
  { family: "Yellowtail", file: "Yellowtail-Regular.ttf", style: "Cursiva" },
  { family: "Cookie", file: "Cookie-Regular.ttf", style: "Cursiva" },
  { family: "Satisfy", file: "Satisfy-Regular.ttf", style: "Cursiva" },
  { family: "Chewy", file: "Chewy-Regular.ttf", style: "Arredondada" },
  { family: "Titan One", file: "TitanOne-Regular.ttf", style: "Arredondada" },
  { family: "Luckiest Guy", file: "LuckiestGuy-Regular.ttf", style: "Marcante" },
  { family: "Bungee", file: "Bungee-Regular.ttf", style: "Marcante" },
  { family: "Righteous", file: "Righteous-Regular.ttf", style: "Marcante" },
];

export const findFont = (family: string) => LAB_FONTS.find((f) => f.family === family) ?? LAB_FONTS[0];
export const fontUrl = (f: Pick<LabFont, "file">) => `/lab/fonts/${f.file}`;

/** Icon font: Font Awesome Free solid (the font files are SIL OFL 1.1). Must match ICON_FONT in the .scad models. */
export const LAB_ICON_FONT = { family: "Font Awesome 6 Free", file: "fa-solid-900.ttf" };

export type LabIcon = { id: string; label: string; code: number };

/** Ready-made icons, picked for professions and gifts. `code` is the Font Awesome codepoint. */
export const LAB_ICONS: LabIcon[] = [
  { id: "heart", label: "Coração", code: 0xf004 },
  { id: "star", label: "Estrela", code: 0xf005 },
  { id: "crown", label: "Coroa", code: 0xf521 },
  { id: "gem", label: "Diamante", code: 0xf3a5 },
  { id: "sun", label: "Sol", code: 0xf185 },
  { id: "moon", label: "Lua", code: 0xf186 },
  { id: "leaf", label: "Folha", code: 0xf06c },
  { id: "paw", label: "Patinha", code: 0xf1b0 },
  { id: "bone", label: "Osso", code: 0xf5d7 },
  { id: "apple", label: "Maçã (professora)", code: 0xf5d1 },
  { id: "book", label: "Livro", code: 0xf02d },
  { id: "graduation", label: "Formatura", code: 0xf19d },
  { id: "tooth", label: "Dente (dentista)", code: 0xf5c9 },
  { id: "stethoscope", label: "Estetoscópio (saúde)", code: 0xf0f1 },
  { id: "syringe", label: "Seringa (enfermagem)", code: 0xf48e },
  { id: "pills", label: "Remédio (farmácia)", code: 0xf484 },
  { id: "scissors", label: "Tesoura (cabeleireira)", code: 0xf0c4 },
  { id: "brush", label: "Pincel (arte)", code: 0xf1fc },
  { id: "gavel", label: "Martelo (direito)", code: 0xf0e3 },
  { id: "laptop", label: "Notebook (tecnologia)", code: 0xf109 },
  { id: "camera", label: "Câmera", code: 0xf030 },
  { id: "music", label: "Música", code: 0xf001 },
  { id: "ball", label: "Bola", code: 0xf1e3 },
  { id: "dumbbell", label: "Academia", code: 0xf44b },
  { id: "cake", label: "Bolo", code: 0xf1fd },
  { id: "mug", label: "Café", code: 0xf7b6 },
  { id: "house", label: "Casa", code: 0xf015 },
  { id: "car", label: "Carro", code: 0xf1b9 },
  { id: "plane", label: "Avião", code: 0xf072 },
  { id: "baby", label: "Bebê", code: 0xf77c },
];

export const findIcon = (id: string) => LAB_ICONS.find((i) => i.id === id);
export const iconGlyph = (icon: LabIcon) => String.fromCodePoint(icon.code);
