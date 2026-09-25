// Downloads the Lab fonts (Google Fonts, OFL/Apache — free for commercial use) into public/lab/fonts/.
// They ship with the app, so the Lab works offline. Run: pnpm lab:fonts
import fs from "node:fs";
import path from "node:path";

const FONTS = [
  "pacifico/Pacifico-Regular.ttf",
  "lobster/Lobster-Regular.ttf",
  "leckerlione/LeckerliOne-Regular.ttf",
  "kaushanscript/KaushanScript-Regular.ttf",
  "grandhotel/GrandHotel-Regular.ttf",
  "yellowtail/Yellowtail-Regular.ttf",
  "cookie/Cookie-Regular.ttf",
  "satisfy/Satisfy-Regular.ttf",
  "luckiestguy/LuckiestGuy-Regular.ttf",
  "titanone/TitanOne-Regular.ttf",
  "chewy/Chewy-Regular.ttf",
  "bungee/Bungee-Regular.ttf",
  "righteous/Righteous-Regular.ttf",
];

const OUT = path.join(process.cwd(), "public", "lab", "fonts");
fs.mkdirSync(OUT, { recursive: true });

async function fetchFirst(urls) {
  for (const url of urls) {
    const res = await fetch(url);
    if (res.ok) return { url, data: Buffer.from(await res.arrayBuffer()) };
  }
  return null;
}

// Icons: Font Awesome Free solid (fonts under SIL OFL 1.1).
const ICONS = { file: "fa-solid-900.ttf", url: "https://cdn.jsdelivr.net/npm/@fortawesome/fontawesome-free@6/webfonts/fa-solid-900.ttf", license: "https://cdn.jsdelivr.net/npm/@fortawesome/fontawesome-free@6/LICENSE.txt" };
if (!fs.existsSync(path.join(OUT, ICONS.file))) {
  const font = await fetchFirst([ICONS.url]);
  const lic = await fetchFirst([ICONS.license]);
  if (font) fs.writeFileSync(path.join(OUT, ICONS.file), font.data);
  if (lic) fs.writeFileSync(path.join(OUT, "fa-solid-900.LICENSE.txt"), lic.data);
  console.log(font ? "ok" : "não encontrada:", ICONS.file, "(OFL)");
}

for (const rel of FONTS) {
  const [dir, file] = rel.split("/");
  const dest = path.join(OUT, file);
  if (fs.existsSync(dest)) continue;
  const base = (license) => `https://raw.githubusercontent.com/google/fonts/main/${license}/${dir}`;
  const font = await fetchFirst(["ofl", "apache"].map((l) => `${base(l)}/${file}`));
  if (!font) {
    console.error("não encontrada:", rel);
    continue;
  }
  fs.writeFileSync(dest, font.data);
  const license = font.url.includes("/ofl/") ? "OFL.txt" : "LICENSE.txt";
  const lic = await fetchFirst([`${font.url.slice(0, font.url.lastIndexOf("/"))}/${license}`]);
  if (lic) fs.writeFileSync(path.join(OUT, `${path.basename(file, ".ttf")}.${license}`), lic.data);
  console.log("ok", file, `(${font.url.includes("/ofl/") ? "OFL" : "Apache"})`);
}
