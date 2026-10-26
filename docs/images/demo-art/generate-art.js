// Draws illustrated gin bottles and cocktails as SVG, then renders them to PNG
// with the pre-installed Chromium. Usage: node art.js <output dir>
const { chromium } = require("playwright");
const path = require("path");
const OUT = process.argv[2];

// A tiny seeded random generator, so every run draws the same pictures.
function rng(seed) { let s = seed; return () => ((s = (s * 16807) % 2147483647) / 2147483647); }

function background(w, h, seed, tint = "#1d2b22") {
  const r = rng(seed);
  let bokeh = "";
  for (let i = 0; i < 14; i++) {
    const x = r() * w, y = r() * h * 0.6, rad = 20 + r() * 70;
    const c = ["#c7a46b", "#e8c98a", "#7a9a6a", "#f3e2b8"][Math.floor(r() * 4)];
    bokeh += `<circle cx="${x}" cy="${y}" r="${rad}" fill="${c}" opacity="${0.05 + r() * 0.12}" filter="url(#blur)"/>`;
  }
  return `
  <defs>
    <radialGradient id="bg" cx="50%" cy="38%" r="75%">
      <stop offset="0" stop-color="#3a3a2c"/><stop offset="0.55" stop-color="${tint}"/><stop offset="1" stop-color="#0c120f"/>
    </radialGradient>
    <linearGradient id="table" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#4a3626"/><stop offset="1" stop-color="#1e140d"/>
    </linearGradient>
    <filter id="blur"><feGaussianBlur stdDeviation="14"/></filter>
    <filter id="soft"><feGaussianBlur stdDeviation="6"/></filter>
    <filter id="grain"><feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" stitchTiles="stitch"/>
      <feColorMatrix values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 0.06 0"/></filter>
  </defs>
  <rect width="${w}" height="${h}" fill="url(#bg)"/>
  ${bokeh}
  <rect y="${h * 0.78}" width="${w}" height="${h * 0.22}" fill="url(#table)"/>
  <rect y="${h * 0.78}" width="${w}" height="3" fill="#7a5a3c" opacity="0.5"/>`;
}

function grain(w, h) { return `<rect width="${w}" height="${h}" filter="url(#grain)"/>`; }

function juniper(x, y, r, seed) {
  const rr = rng(seed); let s = "";
  for (let i = 0; i < 7; i++) {
    const bx = x + (rr() - 0.5) * r * 6, by = y + (rr() - 0.5) * r * 1.5, br = r * (0.75 + rr() * 0.4);
    s += `<circle cx="${bx}" cy="${by}" r="${br}" fill="#2b3550"/><circle cx="${bx}" cy="${by}" r="${br}" fill="url(#berry)"/>
          <circle cx="${bx - br * 0.35}" cy="${by - br * 0.35}" r="${br * 0.22}" fill="#c9d3ea" opacity="0.55"/>`;
  }
  return `<defs><radialGradient id="berry" cx="35%" cy="35%" r="70%"><stop offset="0" stop-color="#6d7fa8" stop-opacity="0.8"/><stop offset="1" stop-color="#141a2b" stop-opacity="0.9"/></radialGradient></defs>${s}`;
}

function sprig(x, y, len, angle, color = "#4f6b45") {
  let leaves = "";
  for (let i = 1; i < 10; i++) {
    const t = i / 10, px = x + Math.cos(angle) * len * t, py = y + Math.sin(angle) * len * t;
    for (const side of [-1, 1]) {
      const a = angle + side * 1.0, lx = px + Math.cos(a) * 26, ly = py + Math.sin(a) * 26;
      leaves += `<line x1="${px}" y1="${py}" x2="${lx}" y2="${ly}" stroke="${color}" stroke-width="5" stroke-linecap="round"/>`;
    }
  }
  return `<line x1="${x}" y1="${y}" x2="${x + Math.cos(angle) * len}" y2="${y + Math.sin(angle) * len}" stroke="#5a4a32" stroke-width="5"/>${leaves}`;
}

// ---------------- Bottles ----------------
function bottle(b, w = 1200, h = 1500) {
  const cx = w / 2, base = h * 0.84;
  const bw = b.width, bh = b.height, r = 34, s = b.shoulder, nw = b.neck, nh = b.neckH;
  const left = cx - bw / 2, right = cx + bw / 2, sh = base - bh, nb = sh - s, nt = nb - nh;
  const p = `M ${left + r} ${base} L ${right - r} ${base} Q ${right} ${base} ${right} ${base - r} L ${right} ${sh}
    C ${right} ${sh - s * 0.65} ${cx + nw / 2} ${nb + s * 0.25} ${cx + nw / 2} ${nb} L ${cx + nw / 2} ${nt}
    L ${cx - nw / 2} ${nt} L ${cx - nw / 2} ${nb} C ${cx - nw / 2} ${nb + s * 0.25} ${left} ${sh - s * 0.65} ${left} ${sh}
    L ${left} ${base - r} Q ${left} ${base} ${left + r} ${base} Z`;
  const ly = sh + bh * b.labelTop, lh = bh * b.labelH, lw = bw * 0.82;
  const fit = b.labelRound > 100 ? 0.8 : 1; // round labels have less room at the edges
  const level = sh - s * 0.3;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="${w * 0.12} ${h * 0.14} ${w * 0.76} ${h * 0.76}">
  ${background(w, h, b.seed, b.bg)}
  <defs>
    <linearGradient id="glass" x1="0" x2="1">
      <stop offset="0" stop-color="${b.glass}" stop-opacity="0.95"/><stop offset="0.25" stop-color="${b.glass}" stop-opacity="0.55"/>
      <stop offset="0.7" stop-color="${b.glass}" stop-opacity="0.6"/><stop offset="1" stop-color="${b.glass}" stop-opacity="0.98"/>
    </linearGradient>
    <linearGradient id="liquid" x1="0" x2="1">
      <stop offset="0" stop-color="${b.liquid}" stop-opacity="0.75"/><stop offset="0.5" stop-color="${b.liquid}" stop-opacity="0.35"/><stop offset="1" stop-color="${b.liquid}" stop-opacity="0.8"/>
    </linearGradient>
    <clipPath id="body"><path d="${p}"/></clipPath>
  </defs>
  <ellipse cx="${cx}" cy="${base + 6}" rx="${bw * 0.62}" ry="22" fill="#000" opacity="0.55" filter="url(#soft)"/>
  <path d="${p}" fill="url(#glass)"/>
  <rect x="0" y="${level}" width="${w}" height="${h}" fill="url(#liquid)" clip-path="url(#body)"/>
  <rect x="${left + 22}" y="${sh}" width="${bw * 0.07}" height="${bh - 60}" rx="12" fill="#fff" opacity="0.22" clip-path="url(#body)"/>
  <rect x="${right - 46}" y="${sh + 20}" width="12" height="${bh - 100}" rx="6" fill="#fff" opacity="0.15" clip-path="url(#body)"/>
  <path d="${p}" fill="none" stroke="#fff" stroke-opacity="0.18" stroke-width="3"/>
  <rect x="${cx - nw / 2 - 8}" y="${nt - b.capH}" width="${nw + 16}" height="${b.capH}" rx="10" fill="${b.cap}"/>
  <rect x="${cx - nw / 2 - 8}" y="${nt - b.capH}" width="${(nw + 16) * 0.3}" height="${b.capH}" rx="10" fill="#fff" opacity="0.15"/>
  <rect x="${cx - lw / 2}" y="${ly}" width="${lw}" height="${lh}" rx="${b.labelRound}" fill="${b.label}"/>
  <rect x="${cx - lw / 2 + 16}" y="${ly + 16}" width="${lw - 32}" height="${lh - 32}" rx="${Math.max(0, b.labelRound - 10)}" fill="none" stroke="${b.ink}" stroke-opacity="0.5" stroke-width="3"/>
  <text x="${cx}" y="${ly + lh * 0.3}" text-anchor="middle" font-family="Georgia, 'Times New Roman', serif" font-size="${Math.min(lw * 0.075, fit * (lw * 1.3) / b.top.length)}" letter-spacing="4" fill="${b.ink}">${b.top}</text>
  <text x="${cx}" y="${ly + lh * 0.55}" text-anchor="middle" font-family="Georgia, 'Times New Roman', serif" font-size="${Math.min(lw * 0.15, fit * (lw * 1.55) / b.name.length)}" font-style="italic" fill="${b.ink}">${b.name}</text>
  <line x1="${cx - lw * 0.25}" y1="${ly + lh * 0.65}" x2="${cx + lw * 0.25}" y2="${ly + lh * 0.65}" stroke="${b.ink}" stroke-width="3"/>
  <text x="${cx}" y="${ly + lh * 0.8}" text-anchor="middle" font-family="Georgia, serif" font-size="${Math.min(lw * 0.06, fit * (lw * 1.2) / b.sub.length)}" letter-spacing="3" fill="${b.ink}">${b.sub}</text>
  ${juniper(cx + bw * 0.75, base - 6, 14, b.seed + 3)}
  ${sprig(cx - bw * 0.95, base - 4, 230, -0.25)}
  ${grain(w, h)}
</svg>`;
}

const BOTTLES = [
  { file: "bottle-black-forest", name: "Black Forest", top: "SCHWARZWALD", sub: "DRY GIN · 47%", width: 420, height: 560, shoulder: 150, neck: 110, neckH: 120, capH: 70, glass: "#2a1d14", liquid: "#2a1d14", cap: "#1a120c", label: "#efe6d2", ink: "#2a2018", labelTop: 0.18, labelH: 0.62, labelRound: 200, seed: 11, bg: "#24261c" },
  { file: "bottle-hollow-cucumber", name: "Rose & Cucumber", top: "HOLLOW LANE", sub: "DISTILLED GIN", width: 400, height: 560, shoulder: 90, neck: 120, neckH: 120, capH: 60, glass: "#1d2420", liquid: "#26302a", cap: "#111", label: "#f2ede1", ink: "#1f2a24", labelTop: 0.22, labelH: 0.5, labelRound: 12, seed: 23 },
  { file: "bottle-copper-ten", name: "No. Ten", top: "COPPER STILL", sub: "SMALL BATCH", width: 300, height: 600, shoulder: 220, neck: 80, neckH: 120, capH: 70, glass: "#2f5f45", liquid: "#3f7a58", cap: "#a8823c", label: "#e9dfc6", ink: "#25392c", labelTop: 0.3, labelH: 0.4, labelRound: 8, seed: 37 },
  { file: "bottle-kyoto", name: "Kyoto Dry", top: "SAKURA HOUSE", sub: "JAPANESE GIN", width: 380, height: 520, shoulder: 70, neck: 150, neckH: 100, capH: 50, glass: "#d9dbd6", liquid: "#eef0ea", cap: "#c7a46b", label: "#ffffff", ink: "#7a2d2d", labelTop: 0.2, labelH: 0.55, labelRound: 6, seed: 41, bg: "#22272a" },
  { file: "bottle-meadow", name: "Meadow", top: "HIGH COAST", sub: "SWEDISH GIN", width: 360, height: 580, shoulder: 140, neck: 100, neckH: 140, capH: 60, glass: "#a9c2c9", liquid: "#cfe0e4", cap: "#2d3b33", label: "#f4efe3", ink: "#2d3b33", labelTop: 0.25, labelH: 0.45, labelRound: 160, seed: 53 },
  { file: "bottle-mediterranean", name: "Mare", top: "COSTA BLANCA", sub: "MEDITERRANEAN", width: 330, height: 600, shoulder: 200, neck: 90, neckH: 130, capH: 60, glass: "#7fa6b8", liquid: "#a8c8d6", cap: "#e9e3d4", label: "#f6f1e6", ink: "#2b4a5a", labelTop: 0.32, labelH: 0.38, labelRound: 140, seed: 67 },
  { file: "bottle-botanist", name: "The Botanist", top: "ISLAY", sub: "22 BOTANICALS", width: 380, height: 540, shoulder: 110, neck: 110, neckH: 110, capH: 80, glass: "#c9cfcc", liquid: "#e0e6e2", cap: "#1d1d1d", label: "#1d2b22", ink: "#e8dcc0", labelTop: 0.2, labelH: 0.58, labelRound: 4, seed: 79 },
  { file: "bottle-london", name: "London Dry", top: "THAMES & CO", sub: "EST. 1879", width: 360, height: 560, shoulder: 120, neck: 100, neckH: 130, capH: 60, glass: "#b8c0c4", liquid: "#dfe4e6", cap: "#8a1d1d", label: "#f2ead8", ink: "#8a1d1d", labelTop: 0.24, labelH: 0.48, labelRound: 10, seed: 97 },
];

// ---------------- Cocktails ----------------
function glass(kind, cx, base) {
  // Returns { outline, liquid (path), rim y } for each glass shape.
  if (kind === "coupe") {
    const top = base - 520, bw = 320, bowlB = base - 300;
    const bowl = `M ${cx - bw} ${top} Q ${cx - bw} ${bowlB} ${cx} ${bowlB} Q ${cx + bw} ${bowlB} ${cx + bw} ${top}`;
    const liq = `M ${cx - bw + 14} ${top + 50} Q ${cx - bw + 30} ${bowlB - 10} ${cx} ${bowlB - 10} Q ${cx + bw - 30} ${bowlB - 10} ${cx + bw - 14} ${top + 50} Z`;
    const stem = `M ${cx - 10} ${bowlB} L ${cx - 10} ${base - 20} M ${cx + 10} ${bowlB} L ${cx + 10} ${base - 20}`;
    return { outline: bowl + " " + stem, foot: [cx, base - 10, 170, 18], liquid: liq, top, rimL: cx - bw, rimR: cx + bw };
  }
  if (kind === "martini") {
    const top = base - 560, bw = 330, tip = base - 290;
    return { outline: `M ${cx - bw} ${top} L ${cx} ${tip} L ${cx + bw} ${top} M ${cx - 9} ${tip} L ${cx - 9} ${base - 20} M ${cx + 9} ${tip} L ${cx + 9} ${base - 20}`,
      foot: [cx, base - 10, 170, 18], liquid: `M ${cx - bw + 40} ${top + 45} L ${cx} ${tip - 12} L ${cx + bw - 40} ${top + 45} Z`, top, rimL: cx - bw, rimR: cx + bw };
  }
  if (kind === "rocks") {
    const top = base - 380, w = 250;
    return { outline: `M ${cx - w} ${top} L ${cx - w + 14} ${base} L ${cx + w - 14} ${base} L ${cx + w} ${top}`, foot: null,
      liquid: `M ${cx - w + 12} ${top + 90} L ${cx - w + 24} ${base - 50} L ${cx + w - 24} ${base - 50} L ${cx + w - 12} ${top + 90} Z`, top, rimL: cx - w, rimR: cx + w, base: base - 50 };
  }
  // highball
  const top = base - 600, w = 165;
  return { outline: `M ${cx - w} ${top} L ${cx - w + 8} ${base} L ${cx + w - 8} ${base} L ${cx + w} ${top}`, foot: null,
    liquid: `M ${cx - w + 10} ${top + 70} L ${cx - w + 16} ${base - 45} L ${cx + w - 16} ${base - 45} L ${cx + w - 10} ${top + 70} Z`, top, rimL: cx - w, rimR: cx + w, base: base - 45 };
}

function garnish(kind, g, cx) {
  const y = g.top;
  switch (kind) {
    case "orange": return `<path d="M ${g.rimR - 90} ${y - 10} q 60 -120 150 -40 q -40 10 -70 60 z" fill="#e8892c"/><path d="M ${g.rimR - 80} ${y - 14} q 55 -100 130 -40" stroke="#f6c27a" stroke-width="8" fill="none"/>`;
    case "lime": return `<g transform="translate(${g.rimR - 20} ${y + 10})"><circle r="95" fill="#9cc34a"/><circle r="80" fill="#d8eaa0"/>${[0, 1, 2, 3, 4, 5, 6, 7].map((i) => `<line x1="0" y1="0" x2="${Math.cos(i * 0.785) * 78}" y2="${Math.sin(i * 0.785) * 78}" stroke="#9cc34a" stroke-width="6"/>`).join("")}</g>`;
    case "lemon": return `<g transform="translate(${g.rimR - 20} ${y + 10})"><circle r="90" fill="#e8c63a"/><circle r="76" fill="#f7ec9e"/>${[0, 1, 2, 3, 4, 5, 6, 7].map((i) => `<line x1="0" y1="0" x2="${Math.cos(i * 0.785) * 74}" y2="${Math.sin(i * 0.785) * 74}" stroke="#e8c63a" stroke-width="6"/>`).join("")}</g>`;
    case "olive": return `<line x1="${cx + 120}" y1="${y - 140}" x2="${cx - 60}" y2="${y + 160}" stroke="#c7a46b" stroke-width="7"/><ellipse cx="${cx + 10}" cy="${y + 60}" rx="38" ry="30" fill="#6f7d2a"/><circle cx="${cx + 22}" cy="${y + 52}" r="10" fill="#b5372e"/>`;
    case "cherry": return `<path d="M ${cx + 40} ${y + 40} q 30 -120 110 -170" stroke="#3b2a14" stroke-width="6" fill="none"/><circle cx="${cx + 30}" cy="${y + 60}" r="36" fill="#6d0f1c"/><circle cx="${cx + 18}" cy="${y + 48}" r="10" fill="#fff" opacity="0.4"/>`;
    case "mint": return [0, 1, 2].map((i) => `<ellipse cx="${g.rimR - 40 - i * 50}" cy="${y - 20 - i * 25}" rx="55" ry="26" transform="rotate(${-30 + i * 25} ${g.rimR - 40 - i * 50} ${y - 20 - i * 25})" fill="#3f7a3a"/>`).join("");
    case "berries": return [0, 1, 2].map((i) => `<circle cx="${cx - 40 + i * 45}" cy="${y + 60 - (i % 2) * 20}" r="30" fill="#2a0f2a"/><circle cx="${cx - 48 + i * 45}" cy="${y + 52 - (i % 2) * 20}" r="8" fill="#fff" opacity="0.3"/>`).join("");
    default: return "";
  }
}

function cocktail(c, w = 1200, h = 900) {
  const cx = w / 2, base = h * 0.86;
  const g = glass(c.glass, cx, base);
  let ice = "";
  if (c.ice && g.base) {
    const r = rng(c.seed);
    for (let i = 0; i < c.ice; i++) {
      const s = 110, x = cx - 150 + r() * 200, y = g.top + 90 + r() * (g.base - g.top - 200), a = r() * 30 - 15;
      ice += `<rect x="${x}" y="${y}" width="${s}" height="${s}" rx="18" fill="#fff" opacity="0.18" stroke="#fff" stroke-opacity="0.4" stroke-width="3" transform="rotate(${a} ${x + s / 2} ${y + s / 2})"/>`;
    }
  }
  let bubbles = "";
  if (c.bubbles) {
    const r = rng(c.seed + 5);
    for (let i = 0; i < 40; i++) bubbles += `<circle cx="${cx - 130 + r() * 260}" cy="${g.top + 100 + r() * (base - g.top - 170)}" r="${2 + r() * 5}" fill="#fff" opacity="0.5"/>`;
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="${w * 0.14} ${h * 0.12} ${w * 0.72} ${h * 0.8}">
  ${background(w, h, c.seed, c.bg)}
  <defs><linearGradient id="drink" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${c.color}" stop-opacity="0.85"/><stop offset="1" stop-color="${c.color2 || c.color}" stop-opacity="0.95"/></linearGradient></defs>
  <ellipse cx="${cx}" cy="${base + 4}" rx="${(g.rimR - g.rimL) * 0.5}" ry="20" fill="#000" opacity="0.5" filter="url(#soft)"/>
  <path d="${g.liquid}" fill="url(#drink)"/>
  ${ice}${bubbles}
  <path d="${g.liquid}" fill="none" stroke="#fff" stroke-opacity="0.2" stroke-width="3"/>
  <path d="${g.outline}" fill="none" stroke="#f4efe3" stroke-opacity="0.55" stroke-width="7" stroke-linejoin="round"/>
  <path d="${g.outline}" fill="#fff" fill-opacity="0.06"/>
  ${g.foot ? `<ellipse cx="${g.foot[0]}" cy="${g.foot[1]}" rx="${g.foot[2]}" ry="${g.foot[3]}" fill="#fff" opacity="0.18" stroke="#f4efe3" stroke-opacity="0.5" stroke-width="5"/>` : ""}
  <line x1="${g.rimL + 30}" y1="${g.top + 30}" x2="${g.rimL + 60}" y2="${(g.base || g.top + 200) - 40}" stroke="#fff" stroke-opacity="0.25" stroke-width="10" stroke-linecap="round"/>
  ${garnish(c.garnish, g, cx)}
  ${c.side === "juniper" ? juniper(cx + 380, base, 14, c.seed + 9) : ""}
  ${c.side === "sprig" ? sprig(cx - 520, base - 4, 220, -0.2) : ""}
  ${grain(w, h)}
</svg>`;
}

const COCKTAILS = [
  { file: "cocktail-negroni", glass: "rocks", color: "#c4241f", color2: "#7e1010", garnish: "orange", ice: 2, seed: 101, side: "juniper" },
  { file: "cocktail-gin-tonic", glass: "highball", color: "#e8f1ea", color2: "#c9ddd0", garnish: "lime", ice: 3, bubbles: true, seed: 103, side: "sprig" },
  { file: "cocktail-dry-martini", glass: "martini", color: "#eef0e2", color2: "#d9dcc4", garnish: "olive", seed: 107, side: "juniper", bg: "#1a2420" },
  { file: "cocktail-aviation", glass: "coupe", color: "#b9a6d8", color2: "#8f7bb8", garnish: "cherry", seed: 109, side: "sprig" },
  { file: "cocktail-french-75", glass: "coupe", color: "#f1dc8a", color2: "#d9b850", garnish: "lemon", bubbles: true, seed: 113, side: "juniper" },
  { file: "cocktail-tom-collins", glass: "highball", color: "#f4eab8", color2: "#e2d48a", garnish: "lemon", ice: 3, bubbles: true, seed: 127, side: "sprig" },
  { file: "cocktail-southside", glass: "coupe", color: "#cfe3a6", color2: "#a9c97a", garnish: "mint", seed: 131, side: "juniper" },
  { file: "cocktail-bramble", glass: "rocks", color: "#6a1b4d", color2: "#3a0d2a", garnish: "berries", ice: 2, seed: 137, side: "sprig" },
];

function hero(w = 1600, h = 1000) {
  const c = { glass: "coupe", color: "#e8f1ea", color2: "#c9ddd0", garnish: "orange", bubbles: true, seed: 211 };
  const svg = cocktail(c, w, h).replace(/<\/svg>$/, "");
  return svg + `${juniper(w * 0.2, h * 0.84, 18, 5)}${sprig(w * 0.72, h * 0.84, 300, -0.15)}</svg>`;
}

function berries(w = 1600, h = 1000) {
  let s = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">${background(w, h, 307)}`;
  const r = rng(311);
  for (let i = 0; i < 9; i++) s += juniper(r() * w, h * 0.55 + r() * h * 0.35, 16 + r() * 8, 400 + i);
  s += sprig(w * 0.1, h * 0.9, 600, -0.35) + sprig(w * 0.6, h * 0.95, 500, -0.6) + grain(w, h) + "</svg>";
  return s;
}

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const render = async (file, svg, w, h) => {
    await page.setViewportSize({ width: w, height: h });
    await page.setContent(`<html><body style="margin:0">${svg}</body></html>`);
    await page.screenshot({ path: path.join(OUT, `${file}.jpg`), type: "jpeg", quality: 88 });
  };
  for (const b of BOTTLES) await render(b.file, bottle(b), 1200, 1500);
  for (const c of COCKTAILS) await render(c.file, cocktail(c), 1200, 900);
  await render("hero-copa", hero(), 1600, 1000);
  await render("juniper-berries", berries(), 1600, 1000);
  await browser.close();
  console.log("done");
})();
