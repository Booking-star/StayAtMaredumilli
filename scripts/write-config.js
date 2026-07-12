const fs = require("fs");
const path = require("path");

// Load local .env file if it exists
const envPath = path.join(process.cwd(), ".env");
if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, "utf8");
  for (const line of envContent.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const [key, ...valueParts] = trimmed.split("=");
    if (key && valueParts.length) {
      process.env[key.trim()] = valueParts.join("=").trim();
    }
  }
}

const config = {
  url: process.env.SUPABASE_URL || "",
  anonKey: process.env.SUPABASE_ANON_KEY || "",
  roomBucket: process.env.SUPABASE_ROOM_BUCKET || "room-images"
};

const publicDir = path.join(process.cwd(), "public");
if (!fs.existsSync(publicDir)) {
  fs.mkdirSync(publicDir);
}

for (const file of ["index.html", "admin.html", "owner.html", "login.html", "privacy.html", "faq.html", "about.html", "policy.html", "policy.js", "404.html", "robots.txt", "sitemap.xml", "favicon.svg", "styles.css", "app.js", "admin.js", "owner.js", "book.html", "book.js", "landing.mp4", "landing-vertical.mp4", "manifest.json", "sw.js"]) {
  fs.copyFileSync(file, path.join(publicDir, file));
}

fs.mkdirSync(path.join(publicDir, "policies"), { recursive: true });
fs.copyFileSync(path.join("policies", "all-policies-combined.md"), path.join(publicDir, "policies", "all-policies-combined.md"));

fs.writeFileSync(
  path.join(publicDir, "supabase-config.js"),
  `window.STAY_SUPABASE = ${JSON.stringify(config, null, 2)};\n`
);
