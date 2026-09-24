// Records a walkthrough of the UI and turns it into docs/demo.gif.
// Needs the app running on :3456 (service or `pnpm dev`) and ffmpeg. Read-only: it never clicks
// approve/generate, so it doesn't change your products or start Codex jobs.
//   node scripts/record-demo.mjs [product-slug]
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { chromium } from "playwright";

const BASE = process.env.STUDIO_URL ?? "http://localhost:3456";
const SLUG = process.argv[2] ?? "cavalo-carrossel";
const OUT = path.resolve("docs/demo.gif");
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "studio-demo-"));
const size = { width: 1280, height: 760 };

const browser = await chromium.launch({ executablePath: process.env.CHROME_BIN ?? "/usr/bin/google-chrome" });
const context = await browser.newContext({ viewport: size, recordVideo: { dir: tmp, size } });
const page = await context.newPage();
const pause = (ms) => page.waitForTimeout(ms);

// Moves the mouse visibly to an element before clicking it.
async function click(locator) {
  const box = await locator.boundingBox();
  if (box) await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2, { steps: 12 });
  await pause(250);
  await locator.click();
}

await page.goto(BASE);
await page.getByText("Em criação").first().waitFor();
await pause(2200);

await click(page.locator(`a[href="/products/${SLUG}"]`));
await page.getByText("Fotos reais do produto").waitFor();
await pause(2500);

await click(page.getByRole("button", { name: /2\. Gerar/ }));
await pause(1500);
await click(page.getByText("Cenário de referência"));
await pause(1500);
await click(page.getByText("Variação de cor"));
await pause(1000);
for (const name of ["Azul Cyan", "Verde", "Roxo"]) {
  await click(page.getByRole("button", { name, exact: true }).first());
  await pause(400);
}
await pause(1500);

await click(page.getByRole("button", { name: /3\. Candidatas/ }));
await pause(1200);
await click(page.getByRole("button", { name: "Todas" }));
await pause(2200);
await page.getByText("prompt usado").first().click();
await pause(2200);

await click(page.getByRole("button", { name: /4\. Aprovadas/ }));
await pause(3000);

const video = page.video();
await context.close();
await browser.close();
const webm = await video.path();

fs.mkdirSync(path.dirname(OUT), { recursive: true });
execFileSync("ffmpeg", [
  "-y", "-loglevel", "error", "-i", webm,
  "-vf", "fps=10,scale=960:-1:flags=lanczos,split[a][b];[a]palettegen=max_colors=128:stats_mode=diff[p];[b][p]paletteuse=dither=bayer:bayer_scale=4:diff_mode=rectangle",
  OUT,
]);
fs.rmSync(tmp, { recursive: true, force: true });
console.log(`GIF salvo em ${OUT} (${(fs.statSync(OUT).size / 1024 / 1024).toFixed(1)} MB)`);
