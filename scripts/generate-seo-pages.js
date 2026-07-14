const fs = require("fs");
const path = require("path");

const SITE = "https://stayatmaredumilli.com";
const ROOT = process.cwd();
const PUBLIC = path.join(ROOT, "public");

loadEnv();

function loadEnv() {
  for (const file of [".env", ".env.local"]) {
    const envPath = path.join(ROOT, file);
    if (!fs.existsSync(envPath)) continue;
    for (const line of fs.readFileSync(envPath, "utf8").split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const [key, ...parts] = trimmed.split("=");
      if (key && parts.length) {
        let val = parts.join("=").trim();
        if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
          val = val.slice(1, -1);
        }
        process.env[key.trim()] = val;
      }
    }
  }
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, char => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "\"": "&quot;",
    "'": "&#39;"
  }[char]));
}

function slugify(value) {
  return String(value || "hotel")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 70) || "hotel";
}

function uniqueSlugs(rooms) {
  const seen = new Map();
  return rooms.map(room => {
    const base = slugify(room.room_name);
    const count = seen.get(base) || 0;
    seen.set(base, count + 1);
    return { ...room, slug: count ? `${base}-${count + 1}` : base };
  });
}

function description(room) {
  const parts = [
    room.special_attention,
    `${room.room_type || "Room"} stay in Maredumilli`,
    room.amenities?.length ? `Amenities: ${room.amenities.slice(0, 5).join(", ")}` : ""
  ].filter(Boolean).join(". ");
  return parts.slice(0, 155);
}

function image(room) {
  return room.image_urls?.[0] || "";
}

function displayImage(src, width = 1200, height = 900, quality = 75, resize = "cover") {
  if (!src) return src;
  const marker = "/storage/v1/object/public/";
  if (!src.includes(marker)) return src;
  try {
    const url = new URL(src);
    return `${url.origin}/storage/v1/render/image/public/${src.split(marker)[1]}?width=${width}&height=${height}&resize=${resize}&quality=${quality}`;
  } catch {
    return "";
  }
}

async function fetchRooms() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_ANON_KEY;
  if (!url || !key) return [];
  const endpoint = `${url.replace(/\/$/, "")}/rest/v1/rooms_public?select=*&active=eq.true&order=created_at.desc`;
  const res = await fetch(endpoint, {
    headers: { apikey: key, authorization: `Bearer ${key}` }
  });
  if (!res.ok) throw new Error(`Supabase rooms_public failed: ${res.status} ${await res.text()}`);
  return uniqueSlugs(await res.json());
}

function pageShell({ title, desc, canonical, ogImage, body, jsonLd, noindex = false, script = "" }) {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(title)}</title>
  <meta name="description" content="${escapeHtml(desc)}">
  ${noindex ? '<meta name="robots" content="noindex,nofollow">' : ""}
  <link rel="canonical" href="${escapeHtml(canonical)}">
  <meta property="og:title" content="${escapeHtml(title)}">
  <meta property="og:description" content="${escapeHtml(desc)}">
  <meta property="og:type" content="website">
  <meta property="og:url" content="${escapeHtml(canonical)}">
  ${ogImage ? `<meta property="og:image" content="${escapeHtml(ogImage)}">` : ""}
  <link rel="icon" href="/favicon.svg" type="image/svg+xml">
  <link rel="stylesheet" href="/styles.css?v=hotel-detail">
  <script type="application/ld+json">${JSON.stringify(jsonLd)}</script>
  ${script}
</head>
<body class="policy-page">
  ${body}
</body>
</html>`;
}

function hotelCard(room) {
  const url = `/hotels/${room.slug}`;
  const imgUrl = displayImage(image(room), 600, 450, 75, "cover");
  return `<article class="seo-card">
    ${image(room) ? `<a href="${url}"><img src="${escapeHtml(imgUrl)}" data-original="${escapeHtml(image(room))}" onerror="this.onerror=null;this.src=this.dataset.original" alt="${escapeHtml(room.room_name)}"></a>` : ""}
    <div>
      <p class="eyebrow">${escapeHtml(room.room_type || "Stay")}</p>
      <h2><a href="${url}">${escapeHtml(room.room_name)}</a></h2>
      <p>${escapeHtml(description(room))}</p>
      <strong>From Rs.${Number(room.weekday_price || room.weekend_price || 0).toLocaleString("en-IN")} per room/day</strong>
    </div>
  </article>`;
}

function writeHotelsIndex(rooms) {
  const body = `<main class="policy-shell seo-shell">
    <a class="wordmark" href="/" aria-label="Stay@Maredumilli home"><img class="brand-logo" src="/brand-logo.png" alt="" aria-hidden="true"><span>Stay@Maredumilli</span></a>
    <section class="policy-content">
      <h1>Maredumilli Hotels and Nature Stays</h1>
      <p>Browse room listings with real photos, amenities, and prices around Maredumilli.</p>
      <div class="seo-grid">${rooms.map(hotelCard).join("") || "<p>No hotels are live yet.</p>"}</div>
    </section>
  </main>`;
  const html = pageShell({
    title: "Maredumilli Hotels and Nature Stays | Stay@Maredumilli",
    desc: "Browse hotels and nature stays around Maredumilli with room photos, amenities, and live booking access.",
    canonical: `${SITE}/hotels`,
    ogImage: image(rooms[0] || {}),
    body,
    jsonLd: { "@context": "https://schema.org", "@type": "WebSite", name: "Stay@Maredumilli", url: SITE }
  });
  const dir = path.join(PUBLIC, "hotels");
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "index.html"), html);
}

function writeHotel(room) {
  const canonical = `${SITE}/hotels/${room.slug}`;
  const desc = description(room);
  const title = `${room.room_name} - Maredumilli | Stay@Maredumilli`;
  const price = Number(room.weekday_price || room.weekend_price || 0);
  const images = (room.image_urls || []).filter(Boolean);
  const body = `<main class="hotel-detail-page" data-room-id="${escapeHtml(room.id)}">
    <nav class="hotel-detail-nav">
      <a class="wordmark" href="/" aria-label="Stay@Maredumilli home"><img class="brand-logo" src="/brand-logo.png" alt="" aria-hidden="true"><span>Stay@Maredumilli</span></a>
      <a class="ghost-btn" href="/hotels">All hotels</a>
    </nav>
    <section class="hotel-detail-hero">
      <div class="hotel-detail-carousel">
        <div class="hotel-detail-slides">
          ${images.map((src, index) => {
            const imgUrl = displayImage(src, 1200, 900, 75, "cover");
            return `<img src="${escapeHtml(imgUrl)}" data-original="${escapeHtml(src)}" onerror="this.onerror=null;this.src=this.dataset.original" alt="${escapeHtml(room.room_name)} image ${index + 1}" decoding="async" ${index ? "" : 'fetchpriority="high"'}>`;
          }).join("")}
        </div>
        <button class="heart image-heart hotel-like" type="button" aria-label="Like ${escapeHtml(room.room_name)}">&#9825; <span>0</span></button>
        ${images.length > 1 ? `<button class="slide-btn prev hotel-prev" type="button" aria-label="Previous image">&lt;</button><button class="slide-btn next hotel-next" type="button" aria-label="Next image">&gt;</button><div class="dots">${images.map((_, i) => `<span class="${i === 0 ? "active" : ""}"></span>`).join("")}</div>` : ""}
      </div>
      <div class="hotel-detail-copy">
        <p class="room-type">${escapeHtml(room.room_type || "Stay")}</p>
        <h1>${escapeHtml(room.room_name)}</h1>
        <p>${escapeHtml(desc)}</p>
        <div class="hotel-stat-grid">
          <span><strong>Rs.${price.toLocaleString("en-IN")}</strong><small>per room/day</small></span>
          <span><strong>${escapeHtml(room.max_adults)}</strong><small>max adults/room</small></span>
          <span><strong>${escapeHtml(room.available_rooms)}</strong><small>rooms available</small></span>
        </div>
        ${room.amenities?.length ? `<div class="amenity-icons seo-amenities">${room.amenities.map(item => `<span>${escapeHtml(item)}</span>`).join("")}</div>` : ""}
        <button class="primary-btn seo-book-btn" data-book-room="${escapeHtml(room.id)}" type="button">Book ${escapeHtml(room.room_name)}</button>
      </div>
    </section>
  </main>`;
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Hotel",
    name: room.room_name,
    description: desc,
    image: image(room) || undefined,
    url: canonical,
    address: {
      "@type": "PostalAddress",
      addressLocality: "Maredumilli",
      addressRegion: "Andhra Pradesh",
      addressCountry: "IN"
    },
    priceRange: price ? `Rs.${price}+` : undefined
  };
  Object.keys(jsonLd).forEach(key => jsonLd[key] === undefined && delete jsonLd[key]);
  const script = `<script>
document.addEventListener("DOMContentLoaded", () => {
  const roomId = ${JSON.stringify(room.id)};
  let index = 0;
  const page = document.querySelector(".hotel-detail-page");
  const slides = page?.querySelector(".hotel-detail-slides");
  const dots = [...(page?.querySelectorAll(".dots span") || [])];
  const like = page?.querySelector(".hotel-like");
  const likes = () => JSON.parse(localStorage.getItem("stayLikes") || "[]");
  const saveLikes = value => localStorage.setItem("stayLikes", JSON.stringify(value));
  const sync = () => {
    if (slides) slides.style.transform = "translateX(-" + (index * 100) + "%)";
    dots.forEach((dot, i) => dot.classList.toggle("active", i === index));
    const liked = likes().includes(roomId);
    like?.classList.toggle("liked", liked);
    const label = like?.querySelector("span");
    if (label) label.textContent = liked ? "1" : "0";
  };
  page?.querySelector(".hotel-prev")?.addEventListener("click", () => { index = Math.max(0, index - 1); sync(); });
  page?.querySelector(".hotel-next")?.addEventListener("click", () => { index = Math.min(dots.length - 1, index + 1); sync(); });
  like?.addEventListener("click", () => {
    const current = likes();
    saveLikes(current.includes(roomId) ? current.filter(id => id !== roomId) : [...current, roomId]);
    sync();
  });
  page?.querySelector("[data-book-room]")?.addEventListener("click", () => {
    localStorage.setItem("stayPendingRoomId", roomId);
    location.href = "/book.html?room=" + encodeURIComponent(roomId);
  });
  sync();
});
</script>`;
  const dir = path.join(PUBLIC, "hotels", room.slug);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "index.html"), pageShell({ title, desc, canonical, ogImage: image(room), body, jsonLd, script }));
}

function writeAuthNoindexPages() {
  for (const route of ["bookings", "profile", "checkout", "confirmation"]) {
    const html = pageShell({
      title: `${route[0].toUpperCase()}${route.slice(1)} | Stay@Maredumilli`,
      desc: "Private Stay@Maredumilli customer page.",
      canonical: `${SITE}/${route}`,
      ogImage: `${SITE}/favicon.svg`,
      noindex: true,
      body: `<main class="policy-shell"><section class="policy-content"><h1>${escapeHtml(route)}</h1><p>This page is private. Continue to the app.</p><p><a href="/#${route === "bookings" ? "bookings" : route === "profile" ? "profile" : "home"}">Open app</a></p></section></main>`,
      jsonLd: { "@context": "https://schema.org", "@type": "WebPage", name: route }
    });
    const dir = path.join(PUBLIC, route);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, "index.html"), html);
  }
}

function writePolicyRoutes() {
  const html = fs.readFileSync(path.join(ROOT, "policy.html"), "utf8");
  for (const route of ["terms-of-service", "cancellation-policy", "check-in-policy"]) {
    const dir = path.join(PUBLIC, "policies", route);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, "index.html"), html);
  }
}

function writeSitemap(rooms) {
  const urls = [
    ["", "1.0"],
    ["hotels", "0.8"],
    ["about", "0.5"],
    ["privacy-policy", "0.4"],
    ["faq", "0.5"],
    ["policies/terms-of-service", "0.3"],
    ["policies/cancellation-policy", "0.3"],
    ["policies/check-in-policy", "0.3"],
    ...rooms.map(room => [`hotels/${room.slug}`, "0.7"])
  ];
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map(([loc, priority]) => `  <url><loc>${SITE}/${loc}</loc><priority>${priority}</priority></url>`).join("\n")}
</urlset>
`;
  fs.writeFileSync(path.join(PUBLIC, "sitemap.xml"), xml);
  fs.writeFileSync(path.join(ROOT, "sitemap.xml"), xml);
}

(async () => {
  const rooms = await fetchRooms();
  fs.rmSync(path.join(PUBLIC, "hotels"), { recursive: true, force: true });
  writeHotelsIndex(rooms);
  rooms.forEach(writeHotel);
  writeAuthNoindexPages();
  writePolicyRoutes();
  writeSitemap(rooms);
  console.log(`Generated SEO pages for ${rooms.length} hotel(s).`);
})();
