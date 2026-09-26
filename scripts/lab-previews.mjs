// Takes the gallery pictures of the Lab tools (public/lab/previews/<id>.png) from the 3D of each editor, with the
// tool's starting values. Run it again when a tool's model or default values change.
// Needs the app running (service on :3456, or STUDIO_URL). Only opens the editors: nothing is saved to the history.
//   node scripts/lab-previews.mjs [tool-id...]
import fs from "node:fs";
import path from "node:path";
import { chromium } from "playwright";

const BASE = process.env.STUDIO_URL ?? "http://localhost:3456";
const TOOLS = process.argv.slice(2).length ? process.argv.slice(2) : ["chaveiro", "etiqueta-de-bolsa", "enfeite-de-clipe"];
const OUT = path.resolve("public/lab/previews");
const size = { width: 960, height: 600 };

// Only the 3D, filling the picture, over the same soft background as the other cards.
const ONLY_3D = `
  body * { visibility: hidden !important; transition: none !important; }
  [data-lab-viewer], [data-lab-viewer] canvas { visibility: visible !important; }
  [data-lab-viewer] { position: fixed !important; inset: 0 !important; width: 100vw !important; height: 100vh !important;
    border-radius: 0 !important; background: linear-gradient(#fdfdfd, #f3f1ee) !important; }
`;

const browser = await chromium.launch({ executablePath: process.env.CHROME_BIN ?? "/usr/bin/google-chrome", args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
const page = await browser.newPage({ viewport: size });
fs.mkdirSync(OUT, { recursive: true });

for (const id of TOOLS) {
  await page.goto(`${BASE}/lab/${id}/novo?exemplo&foto`); // the sample, without the floor grid
  await page.addStyleTag({ content: ONLY_3D });
  // "Pronto" = the model finished rendering; then give the camera a moment to settle.
  await page.getByText("Pronto", { exact: true }).first().waitFor({ state: "attached", timeout: 90_000 });
  // Frame the piece again for the picture's size ("Centralizar"), then let the camera settle.
  // In the drawing editor, step back once so the virtual clip fits too ("Afastar").
  await page.evaluate(() => {
    document.querySelectorAll('[title="Centralizar"]').forEach((b) => b.click());
    document.querySelector('[title="Afastar"]')?.click();
  });
  await page.waitForTimeout(1500);
  const file = path.join(OUT, `${id}.png`);
  await page.screenshot({ path: file });
  console.log("✓", path.relative(process.cwd(), file));
}

await browser.close();
