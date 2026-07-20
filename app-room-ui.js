function displayImage(src, width = 1200, height = 900, quality = 75, resize = "cover") {
  if (!src) return src;
  if (typeof src === "string" && src.includes("cdn.jsdelivr.net/gh/kandregulaashok15-gif/StayAtMaredumilli")) {
    src = src.replace(/^https?:\/\/cdn\.jsdelivr\.net\/gh\/kandregulaashok15-gif\/StayAtMaredumilli/, "");
  }
  const marker = "/storage/v1/object/public/";
  if (!src.includes(marker)) return src;
  try {
    const url = new URL(src);
    return `${url.origin}/storage/v1/render/image/public/${src.split(marker)[1]}?width=${width}&height=${height}&resize=${resize}&quality=${quality}`;
  } catch {
    return "";
  }
}

function amenityList(room) {
  return (Array.isArray(room.amenities) ? room.amenities : String(room.amenities || "").split(","))
    .map(item => item.trim())
    .filter(item => item && !/firecamp/i.test(item));
}

function hasFirecamp(room) {
  const list = Array.isArray(room.amenities) ? room.amenities : String(room.amenities || "").split(",");
  return list.some(item => /firecamp/i.test(item));
}

const amenityRank = [
  /swimming pool/i,
  /^(ac|non ac)$/i,
  /geyser/i,
  /wifi/i,
  /^tv$/i,
  /power backup/i,
  /generator power backup/i,
  /pets allowed/i
];

function rankedAmenities(amenities) {
  return [...amenities].sort((a, b) => rankAmenity(a) - rankAmenity(b));
}

function rankAmenity(name) {
  const index = amenityRank.findIndex(pattern => pattern.test(name));
  return index === -1 ? 99 : index;
}

function amenityIcon(name) {
  const lower = name.toLowerCase();
  if (lower.includes("wifi")) return "wifi";
  if (lower === "ac" || lower.includes("non ac")) return "snowflake";
  if (lower.includes("parking")) return "car";
  if (lower.includes("fire")) return "flame";
  if (lower.includes("pool")) return "waves";
  if (lower.includes("pet")) return "paw-print";
  if (lower.includes("tv")) return "tv";
  if (lower.includes("bed")) return "bed";
  if (lower.includes("geyser")) return "shower-head";
  if (lower.includes("power") || lower.includes("generator")) return "plug-zap";
  return "circle-check";
}

function amenityIcons(room) {
  const amenities = rankedAmenities(amenityList(room));
  const primary = amenities.filter(item => rankAmenity(item) < 99).slice(0, 2);
  const rest = amenities.filter(item => !primary.includes(item));
  const shown = expandedAmenities.includes(room.id) ? [...primary, ...rest] : primary;
  return `
    <div class="amenity-icons">
      ${shown.map(item => `<span><i data-lucide="${amenityIcon(item)}"></i>${escapeHtml(item)}</span>`).join("")}
      ${rest.length ? `<button class="more-amenities" data-action="toggleAmenities" data-room="${room.id}" type="button"><i data-lucide="more-horizontal"></i>${expandedAmenities.includes(room.id) ? "Less" : `More ${rest.length}`}</button>` : ""}
    </div>
  `;
}
