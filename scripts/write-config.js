const fs = require("fs");
const path = require("path");

// Load local .env or .env.local files if they exist
for (const file of [".env", ".env.local"]) {
  const envPath = path.join(process.cwd(), file);
  if (fs.existsSync(envPath)) {
    const envContent = fs.readFileSync(envPath, "utf8");
    for (const line of envContent.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const [key, ...valueParts] = trimmed.split("=");
      if (key && valueParts.length) {
        let val = valueParts.join("=").trim();
        if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
          val = val.slice(1, -1);
        }
        process.env[key.trim()] = val;
      }
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

const filesToCopy = [
  "index.html", "admin.html", "owner.html", "login.html", "privacy.html",
  "faq.html", "about.html", "policy.html", "policy.js", "404.html",
  "robots.txt", "sitemap.xml", "favicon.ico", "favicon.svg", "brand-logo.png",
  "styles.css", "shared.js", "admin-styles.css", "admin-shared.js",
  "app-room-ui.js", "app.js", "admin-ui.js", "admin.js", "admin-settings.js",
  "owner.js", "book.html", "book.js", "payment-service.js", "landing.mp4", "landing-vertical.mp4",
  "manifest.json", "sw.js"
];

for (const file of filesToCopy) {
  fs.copyFileSync(file, path.join(publicDir, file));
}

// Copy subfolders
const foldersToCopy = ["checkout", "confirmation", "bookings", "profile", "images", "policies"];
for (const folder of foldersToCopy) {
  const srcFolder = path.join(process.cwd(), folder);
  const destFolder = path.join(publicDir, folder);
  if (fs.existsSync(srcFolder)) {
    fs.cpSync(srcFolder, destFolder, { recursive: true });
  }
}

fs.writeFileSync(
  path.join(publicDir, "supabase-config.js"),
  `window.STAY_SUPABASE = ${JSON.stringify(config, null, 2)};\n`
);
