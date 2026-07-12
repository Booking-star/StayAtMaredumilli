const fs = require("fs");

const read = file => fs.readFileSync(file, "utf8");
const fail = message => {
  throw new Error(message);
};

const index = read("index.html");
const css = read("styles.css");
const shared = read("shared.js");
const book = read("book.js");
const seo = read("scripts/generate-seo-pages.js");
const vercel = read("vercel.json");

if ((index.match(/terms-of-service/g) || []).length !== 1) fail("Terms link should appear once on home/profile.");
if ((index.match(/cancellation-policy/g) || []).length !== 1) fail("Cancellation link should appear once on home/profile.");
if (!index.includes("support-list")) fail("Support should use formatted rows, not one paragraph.");
if (!index.includes("app-room-ui.js")) fail("Room UI helper must load before app.js.");
if (!/<\/div>\s*<nav class="bottom-nav hidden">/.test(index)) fail("Bottom nav must live outside #app.");
if (!/\.bottom-nav\s*{[\s\S]*position:\s*fixed\s*!important/.test(css)) fail("Bottom nav must stay fixed.");
if (!/\.bottom-nav\s*{[\s\S]*transform:\s*none\s*!important/.test(css)) fail("Bottom nav must not use transform on mobile.");
if (!css.includes("--bottom-nav-space: 156px")) fail("Mobile bottom spacing must protect content from nav overlap.");
if (!/supabase\|row-level security\|permission denied\|violates/.test(shared)) fail("Backend errors must be masked for customers.");
if (!book.includes('loading="lazy" decoding="async"')) fail("Booking room image should not block checkout rendering.");
if (book.includes("adultsInput.value = fitted.adults")) fail("Adult input must not be rewritten while typing.");
if (!book.includes('e.target.id === "adultsInput" && e.type === "change"')) fail("Adult room auto-fit should run on commit, not every keystroke.");
if (!book.includes('localStorage.setItem("stayProfile"')) fail("Booking contact details should persist to profile.");
if (!seo.includes('decoding="async"')) fail("SEO hotel images should decode asynchronously.");
if (!vercel.includes('"X-Frame-Options"') || !vercel.includes('"DENY"')) fail("Clickjacking header missing.");

console.log("static ux/security check passed");
