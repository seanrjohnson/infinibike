import { readFile, writeFile } from "node:fs/promises";
import process from "node:process";

const before = process.argv[2] ?? "before";
const after = process.argv[3] ?? "after";
if (![before, after].every((label) => /^[a-z0-9-]+$/.test(label))) {
  throw new Error(
    "Use capture labels containing lowercase letters, digits, and hyphens.",
  );
}
const load = async (label) =>
  JSON.parse(
    await readFile(`test-results/expansion-${label}/fixtures.json`, "utf8"),
  );
const [baseline, candidate] = await Promise.all([load(before), load(after)]);
const original = new Map(baseline.map((entry) => [entry.name, entry]));
const metrics = (d) =>
  `${Number(d.triangles).toLocaleString("en-US")} triangles · ${d.calls} calls · ${d.geometries} geometries`;
const rows = candidate.map((entry) => {
  const old = original.get(entry.name);
  if (!old) throw new Error(`Missing baseline fixture: ${entry.name}`);
  return `<section data-name="${entry.name}"><h2>${entry.name} · ${entry.distance} m</h2><div class="pair">${[
    [before, old],
    [after, entry],
  ]
    .map(
      ([label, frame]) =>
        `<figure><a href="expansion-${label}/${entry.name}.png"><img loading="lazy" src="expansion-${label}/${entry.name}.png" alt="${label}: ${entry.name}"></a><figcaption><strong>${label}</strong> · ${metrics(frame.diagnostics)}</figcaption></figure>`,
    )
    .join("")}</div></section>`;
});
await writeFile(
  "test-results/expansion-review.html",
  `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Expansive worlds: visual review</title><style>body{margin:0;background:#182320;color:#eef4ee;font:15px system-ui}header{position:sticky;top:0;padding:16px;background:#182320;border-bottom:1px solid #567}h1{margin:0 0 8px;font-size:22px}h2{font-size:16px}input{padding:8px;width:min(500px,85%)}main{padding:16px}.pair{display:grid;grid-template-columns:1fr 1fr;gap:12px}figure{margin:0}img{width:100%;display:block}figcaption{padding:8px;background:#26352e}section{margin-bottom:30px}@media(max-width:700px){.pair{grid-template-columns:1fr}}</style><header><h1>Expansive worlds: ${before} → ${after}</h1><label>Filter views <input id="filter" type="search" placeholder="e.g. city-turn, handlebar, lakeshore"></label><p>Matched seed, camera, distance and viewport. Click images for full resolution. Headless counters do not establish physical-device frame rate.</p></header><main>${rows.join("\n")}</main><script>document.querySelector('#filter').addEventListener('input',event=>{for(const section of document.querySelectorAll('section')) section.hidden=!section.dataset.name.includes(event.target.value.toLowerCase())})</script></html>`,
);
