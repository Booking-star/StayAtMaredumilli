const fs = require("fs");
const http = require("http");
const path = require("path");
const puppeteer = require("puppeteer-core");

const root = path.resolve(__dirname, "..", "public");
const edge = "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe";
const mime = {
  ".css": "text/css",
  ".html": "text/html",
  ".js": "application/javascript",
  ".json": "application/json",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".webp": "image/webp"
};
const pages = [
  "/",
  "/book.html?room=test&from=2026-07-21&to=2026-07-22&adults=2&children=0&rooms=1",
  "/hotels/pushpa/",
  "/login.html?type=admin",
  "/login.html?type=owner",
  "/policies/terms-of-service",
  "/faq.html"
];
const viewports = [
  ["desktop", 1440, 900],
  ["wide", 1920, 1080],
  ["tablet", 820, 1180],
  ["iphone-se", 375, 667],
  ["iphone-pro", 430, 932],
  ["android", 412, 915]
];

function fileFor(urlPath) {
  let file = path.join(root, decodeURIComponent(urlPath));
  if (!file.startsWith(root)) return null;
  if (fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, "index.html");
  if (!fs.existsSync(file) && !path.extname(file)) file = path.join(root, urlPath, "index.html");
  return fs.existsSync(file) ? file : null;
}

const server = http.createServer((req, res) => {
  const file = fileFor(new URL(req.url, "http://local").pathname);
  if (!file) return res.writeHead(404).end("not found");
  res.writeHead(200, { "content-type": mime[path.extname(file)] || "application/octet-stream" });
  fs.createReadStream(file).pipe(res);
});

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

server.listen(0, "127.0.0.1", async () => {
  const base = `http://127.0.0.1:${server.address().port}`;
  const browser = await puppeteer.launch({ executablePath: edge, headless: "new", args: ["--no-sandbox"] });
  const failures = [];
  for (const [name, width, height] of viewports) {
    const page = await browser.newPage();
    await page.setViewport({ width, height, isMobile: width < 900 });
    for (const pagePath of pages) {
      await page.goto(base + pagePath, { waitUntil: "domcontentloaded", timeout: 45000 });
      await sleep(300);
      const result = await page.evaluate(() => {
        const overflow = Math.max(document.documentElement.scrollWidth, document.body.scrollWidth) - innerWidth;
        const nav = document.querySelector(".bottom-nav:not(.hidden)")?.getBoundingClientRect();
        const offscreen = Array.from(document.querySelectorAll("body *")).some(el => {
          if (el.closest(".slides, .hotel-detail-slides")) return false;
          const r = el.getBoundingClientRect();
          const s = getComputedStyle(el);
          return r.width > 1 && r.height > 1 && s.display !== "none" && s.visibility !== "hidden" && (r.left < -2 || r.right > innerWidth + 2);
        });
        const cards = Array.from(document.querySelectorAll(".room-card, .panel, .hotel-detail-card, .policy-card, .auth-card, .login-card")).map(el => el.getBoundingClientRect());
        const navOverlap = nav ? cards.some(c => !(nav.bottom <= c.top || nav.top >= c.bottom || nav.right <= c.left || nav.left >= c.right)) : false;
        return { overflow: Math.round(overflow), offscreen, navOverlap };
      });
      if (result.overflow > 2 || result.offscreen || result.navOverlap) failures.push({ viewport: name, page: pagePath, ...result });
    }
    await page.close();
  }
  await browser.close();
  server.close();
  if (failures.length) throw new Error(`Layout audit failed: ${JSON.stringify(failures)}`);
  console.log("layout audit passed");
});
