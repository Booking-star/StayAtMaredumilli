const landing = document.querySelector("#landing");
const app = document.querySelector("#app");
const loginBtn = document.querySelector("#loginBtn");
const video = document.querySelector(".landing-video");
const feed = document.querySelector("#propertyFeed");
const highlights = document.querySelector("#highlights");
const bookingSummary = document.querySelector("#bookingSummary");
const bookingsList = document.querySelector("#bookingsList");
const likedList = document.querySelector("#likedList");
const savedDetails = document.querySelector("#savedDetails");
const modal = document.querySelector("#bookingModal");
const reelModal = document.querySelector("#reelModal");
const bookingDetailsModal = document.querySelector("#bookingDetailsModal");
const bookingDetailsContent = document.querySelector("#bookingDetailsContent");
const successModal = document.querySelector("#successModal");
const successMessageText = document.querySelector("#successMessageText");
const bookingForm = document.querySelector("#bookingForm");
const modalTitle = document.querySelector("#modalTitle");
const bookingRoomSummary = document.querySelector("#bookingRoomSummary");
const billSummary = document.querySelector("#billSummary");
const firecampField = document.querySelector("#firecampField");
const firecampInput = document.querySelector("#firecampInput");
const manualPaymentBox = document.querySelector("#manualPaymentBox");
const manualUpiId = document.querySelector("#manualUpiId");
const manualPhonePeLink = document.querySelector("#manualPhonePeLink");
const manualUpiLink = document.querySelector("#manualUpiLink");
const paymentScreenshotInput = document.querySelector("#paymentScreenshotInput");
const travelInterestInput = document.querySelector("#travelInterestInput");
const policyConsentInput = document.querySelector("#policyConsentInput");
const reelTitle = document.querySelector("#reelTitle");
const reelEmbed = document.querySelector("#reelEmbed");
const adminRoomForm = document.querySelector("#adminRoomForm");
const adminRoomList = document.querySelector("#adminRoomList");
const adminStatus = document.querySelector("#adminStatus");
const supabaseConfig = window.STAY_SUPABASE || {};
const siteUrl = `${location.origin}/`;
const supabaseClient = supabaseConfig.url && supabaseConfig.anonKey && window.supabase
  ? window.supabase.createClient(supabaseConfig.url, supabaseConfig.anonKey, {
      auth: {
        storageKey: "stay-customer-auth",
        flowType: "implicit",
        detectSessionInUrl: true,
        persistSession: true,
        autoRefreshToken: true
      }
    })
  : null;

function getLocalDateString(date = new Date()) {
  const offset = date.getTimezoneOffset();
  const localDate = new Date(date.getTime() - (offset * 60 * 1000));
  return localDate.toISOString().split("T")[0];
}

function getNextDateString(dateStr) {
  const date = new Date(dateStr);
  if (Number.isNaN(date.getTime())) return "";
  date.setDate(date.getDate() + 1);
  return getLocalDateString(date);
}

function positiveWholeNumber(value) {
  return /^\d+$/.test(String(value).trim());
}

const defaultRooms = [];

let highlightReels = [];

let selectedRoomId = null;
let editingDetailsOnly = false;
let ownerRooms = getStore("stayOwnerRooms", []);
let rooms = [...ownerRooms, ...defaultRooms];
let slides = Object.fromEntries(rooms.map(room => [room.id, 0]));
let likes = getStore("stayLikes", []);
let bookingDetails = getStore("stayBookingDetails", null);
let bookings = getStore("stayBookings", []);
let profile = getStore("stayProfile", {});
let expandedAmenities = [];
let availabilityRefreshTimer = null;

const defaultPricingSettings = {
  occupancy80Surcharge: 200,
  occupancy90Surcharge: 300
};
let pricingSettings = normalizePricingSettings(getStore("stayPricingSettings", defaultPricingSettings));
let paymentSettings = getStore("stayPaymentSettings", { mode: "manual", upiId: "Kandregulaashok1@ybl" });
if (!paymentSettings.upiId) paymentSettings.upiId = "Kandregulaashok1@ybl";

function pendingBookingId() {
  return localStorage.getItem("stayPendingRoomId") || new URLSearchParams(location.search).get("book");
}

function capturePendingBookingParam() {
  const roomId = new URLSearchParams(location.search).get("book");
  if (!roomId) return;
  localStorage.setItem("stayPendingRoomId", roomId);
  history.replaceState({}, "", location.origin + location.pathname + location.hash);
}

function openPendingBookingIfReady() {
  const roomId = pendingBookingId();
  if (!roomId || !rooms.some(room => room.id === roomId)) return false;
  localStorage.removeItem("stayPendingRoomId");
  showScreen("#home");
  openBooking(roomId);
  return true;
}

function getStore(key, fallback) {
  try {
    return JSON.parse(localStorage.getItem(key)) ?? fallback;
  } catch {
    return fallback;
  }
}

function setStore(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
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

function safeUrl(value) {
  try {
    const url = new URL(value, location.origin);
    return /^https?:$/.test(url.protocol) ? url.href : "";
  } catch {
    return "";
  }
}

function validateImageFile(file) {
  if (!file?.type?.startsWith("image/")) throw new Error("Upload image files only.");
  if (file.size > 1024 * 1024) throw new Error("Image must be 1MB or smaller.");
}

function normalizePricingSettings(settings = {}) {
  return {
    occupancy80Surcharge: Math.max(0, Number(settings.occupancy80Surcharge ?? defaultPricingSettings.occupancy80Surcharge) || 0),
    occupancy90Surcharge: Math.max(0, Number(settings.occupancy90Surcharge ?? defaultPricingSettings.occupancy90Surcharge) || 0)
  };
}

async function loadPricingSettings() {
  if (!supabaseClient) return;
  const { data, error } = await supabaseClient.rpc("get_dynamic_pricing");
  if (error) {
    console.warn("Using default pricing settings:", error.message);
    return;
  }
  pricingSettings = normalizePricingSettings(data);
  setStore("stayPricingSettings", pricingSettings);
}

async function loadPaymentSettings() {
  let data = null;
  try {
    const response = await fetch("/api/payment-settings", { cache: "no-store" });
    if (response.ok) data = await response.json();
  } catch (_) {}
  if (!data && supabaseClient) {
    const result = await supabaseClient.rpc("get_payment_settings");
    if (result.error) return;
    data = result.data;
  }
  if (!data) return;
  paymentSettings = ["manual", "mock", "razorpay"].includes(data?.mode)
    ? { mode: data.mode, upiId: data.upiId || "Kandregulaashok1@ybl" }
    : { mode: "manual", upiId: "Kandregulaashok1@ybl" };
  setStore("stayPaymentSettings", paymentSettings);
}

function refreshRooms() {
  if (!supabaseClient) ownerRooms = getStore("stayOwnerRooms", []);
  rooms = ownerRooms;
  slides = { ...Object.fromEntries(rooms.map(room => [room.id, 0])), ...slides };
}

async function loadOwnerRooms() {
  if (!supabaseClient) {
    ownerRooms = getStore("stayOwnerRooms", []);
    return;
  }
  const { data, error } = await supabaseClient
    .from("rooms_public")
    .select("*")
    .eq("active", true)
    .order("created_at", { ascending: false });
  if (error) {
    console.error(error);
    ownerRooms = getStore("stayOwnerRooms", []);
    return;
  }
  ownerRooms = data.map(roomFromSupabase);
}

let allBookings = [];

async function loadAllBookings() {
  if (!supabaseClient) {
    allBookings = getStore("stayBookings", []);
    return;
  }
  const { data, error } = await supabaseClient
    .from("booking_occupancy")
    .select("*");
  if (error) {
    console.error(error);
    return;
  }
  allBookings = data || [];
}

function setLandingVideo() {
  const src = innerWidth >= innerHeight ? "landing.mp4" : "landing-vertical.mp4";
  if (!video.src.endsWith(src)) {
    video.classList.remove("ready");
    video.src = src;
    video.load();
    video.play().catch(() => {});
  }
}

function showScreen(hash) {
  const target = document.querySelector(hash);
  if (!target) return;
  document.querySelectorAll(".screen").forEach(screen => screen.classList.remove("active"));
  document.querySelectorAll(".nav-link").forEach(link => link.classList.toggle("active", link.getAttribute("href") === hash));
  target.classList.add("active");
  render();
}

function render() {
  refreshRooms();
  renderHighlights();
  renderFeed();
  renderSummary();
  renderBookings();
  renderProfile();
  if (window.lucide) lucide.createIcons();
}

function renderAdminStatus() {
  adminStatus.innerHTML = supabaseClient
    ? `<span>Supabase connected · rooms and images save to backend</span>`
    : `<span>Supabase not connected · using this browser only</span>`;
}

function renderHighlights() {
  highlights.innerHTML = highlightReels.map((reel, index) => `
    <button class="highlight reel-highlight" data-action="openReel" data-reel="${index}" type="button" aria-label="Play ${escapeHtml(reel.title)}">
      <span class="reel-ring" style="background: linear-gradient(rgba(0,0,0,0.18), rgba(0,0,0,0.28)), url('${escapeHtml(displayImage(reel.image_url, 360, 360, 65, "cover"))}') center/cover, url('${escapeHtml(safeUrl(reel.image_url))}') center/cover;"><i data-lucide="play"></i></span>
      <span>${escapeHtml(reel.title)}</span>
    </button>
  `).join("");
}

function openReel(index) {
  const reel = highlightReels[index];
  if (!reel) return;
  reelTitle.textContent = reel.title;
  const reelUrl = safeUrl(reel.url);
  reelEmbed.innerHTML = `
    <blockquote class="instagram-media" data-instgrm-permalink="${escapeHtml(reelUrl)}" data-instgrm-version="14"></blockquote>
    <a class="ghost-btn reel-fallback" href="${escapeHtml(reelUrl)}" target="_blank" rel="noopener">Open in Instagram</a>
  `;
  reelModal.showModal();
  setTimeout(() => window.instgrm?.Embeds?.process(), 0);
}

function filteredRooms() {
  const search = document.querySelector("#searchInput").value.toLowerCase();
  const filter = document.querySelector("#filterSelect").value;
  const sort = document.querySelector("#sortSelect").value;
  let list = rooms.filter(room => {
    const text = `${room.type} ${room.name} ${room.location} ${room.amenities}`.toLowerCase();
    if (search && !text.includes(search)) return false;
    if (filter === "liked") return likes.includes(room.id);
    if (filter === "available") return getAvailableRoomsCount(room, bookingDetails) > 0;
    if (filter !== "all") return room.tags.includes(filter);
    return true;
  });
  return list.sort((a, b) => {
    if (sort === "priceLow") return a.price - b.price;
    if (sort === "priceHigh") return b.price - a.price;
    if (sort === "rating") return b.rating - a.rating;
    if (sort === "likes") return totalLikes(b) - totalLikes(a);
    return b.rating + totalLikes(b) / 1000 - (a.rating + totalLikes(a) / 1000);
  });
}

function totalLikes(room) {
  return room.likes + (likes.includes(room.id) ? 1 : 0);
}

function formatLikes(count) {
  if (count < 1000) return count;
  return `${Number((count / 1000).toFixed(1)).toString()}k`;
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

function renderFeed() {
  const list = filteredRooms();
  feed.innerHTML = list.length ? list.map((room, cardIndex) => roomCard(room, cardIndex)).join("") : `<div class="empty">No rooms available yet.</div>`;
}

function roomCard(room, cardIndex = 0) {
  const liked = likes.includes(room.id);
  const index = slides[room.id];
  const roomDetails = detailsForRoom(room, bookingDetails);
  const remainingRooms = getAvailableRoomsCount(room, roomDetails);
  const maxAdultsAvailable = remainingRooms * Math.max(1, Number(room.maxAdults || 1));
  const partialFit = remainingRooms > 0 && Number(roomDetails.adults || 1) > maxAdultsAvailable;
  
  return `
    <article class="room-card">
      <div class="carousel" data-room="${room.id}">
        <div class="slides" style="transform: translateX(-${index * 100}%);">
          ${room.images.map((src, i) => {
            const image = displayImage(src);
            return `<img src="${escapeHtml(image)}" loading="${i === index ? "eager" : "lazy"}" data-original="${escapeHtml(safeUrl(src))}" decoding="async" onerror="this.onerror=null;this.src=this.dataset.original" ${cardIndex === 0 && i === index ? `fetchpriority="high"` : ""} alt="${escapeHtml(room.type)}">`;
          }).join("")}
        </div>
        <button class="heart image-heart ${liked ? "liked" : ""}" data-action="like" data-room="${escapeHtml(room.id)}" aria-label="Like ${escapeHtml(room.name)}">
          <i data-lucide="heart"></i><span>${formatLikes(totalLikes(room))}</span>
        </button>
        <button class="slide-btn prev" data-action="prev" data-room="${escapeHtml(room.id)}" aria-label="Previous image"><i data-lucide="chevron-left"></i></button>
        <button class="slide-btn next" data-action="next" data-room="${escapeHtml(room.id)}" aria-label="Next image"><i data-lucide="chevron-right"></i></button>
        <div class="dots">${room.images.map((_, i) => `<span class="${i === index ? "active" : ""}"></span>`).join("")}</div>
      </div>
      <div class="room-body">
        <div class="room-title">
          <div>
            <p class="room-type">${escapeHtml(room.type)}</p>
            <button class="hotel-link" data-action="book" data-room="${escapeHtml(room.id)}" type="button">${escapeHtml(room.name)}</button>
          </div>
          ${amenityIcons(room)}
        </div>
        <div class="meta" style="display: flex; justify-content: space-between; align-items: center;">
          <span><i data-lucide="map-pin"></i>${escapeHtml(room.location)}</span>
          <span style="font-weight: 600; color: ${remainingRooms > 0 ? "var(--accent)" : "var(--danger)"};">
            ${partialFit ? `Max ${remainingRooms} rooms / ${maxAdultsAvailable} adults` : remainingRooms > 0 ? `${remainingRooms} rooms left` : "Sold Out"}
          </span>
        </div>
        <div class="price-row">
          <strong>${priceLabel(room, roomDetails)} <small>per room/day</small></strong>
          ${remainingRooms > 0 
            ? `<button class="primary-btn" data-action="book" data-room="${escapeHtml(room.id)}" type="button">Book</button>`
            : `<button class="primary-btn" data-action="waitlist" data-room="${escapeHtml(room.id)}" style="background: #444; border-color: #444;" type="button">Sold Out</button>`
          }
        </div>
      </div>
    </article>
  `;
}

function minRoomsForAdults(room, adults = 1) {
  const maxAdults = Math.max(1, Number(room?.maxAdults || 1));
  return Math.max(1, Math.ceil(Number(adults || 1) / maxAdults));
}

function detailsForRoom(room, details = null) {
  const adults = Number(details?.adults || 1);
  const roomsNeeded = minRoomsForAdults(room, adults);
  return {
    ...(details || {}),
    adults,
    rooms: Math.max(Number(details?.rooms || 1), roomsNeeded)
  };
}

function firecampPrice(rooms = 1) {
  return Number(rooms || 1) <= 2 ? 600 : 1000;
}

function bookingReference(id) {
  return `SM-${String(id || Date.now()).replace(/-/g, "").slice(0, 8).toUpperCase()}`;
}

function friendlyBookingError(message = "") {
  if (/conflicting key|no_overlapping_bookings/i.test(message)) return "Booking is blocked by an old database overlap rule. Please contact admin to refresh the booking schema.";
  if (/Only .* room|available for the selected dates/i.test(message)) return message;
  if (/capacity/i.test(message)) return "Guest count exceeds this hotel's room capacity. Please reduce guests or select more rooms.";
  if (/expired/i.test(message)) return "Payment time expired. Please try booking again.";
  if (/signature|verification/i.test(message)) return "Payment verification failed. If money was debited, contact support with your payment ID.";
  return message || "Payment failed. Please try again.";
}

function fitDetailsToAvailability(room, details = null) {
  const fitted = detailsForRoom(room, details);
  const remaining = getAvailableRoomsCount(room, fitted);
  const maxRooms = Math.max(0, remaining);
  const maxAdults = maxRooms * Math.max(1, Number(room.maxAdults || 1));
  const requestedAdults = Number(fitted.adults || 1);
  const adults = maxAdults ? Math.min(requestedAdults, maxAdults) : requestedAdults;
  return {
    ...fitted,
    requestedAdults,
    adults,
    rooms: maxRooms ? Math.min(Number(fitted.rooms || 1), maxRooms) : Number(fitted.rooms || 1),
    maxRooms,
    maxAdults,
    partialFit: requestedAdults > maxAdults
  };
}

function priceLabel(room, details = bookingDetails) {
  return `Rs.${priceForDates(room, detailsForRoom(room, details)).perDay.toLocaleString("en-IN")}`;
}

function priceForDates(room, details = null) {
  const today = new Date();
  const fromStr = details?.from || getLocalDateString(today);
  const toStr = details?.to || getLocalDateString(new Date(today.getTime() + 86400000));
  const numRooms = Number(details?.rooms || 1);
  
  const from = new Date(fromStr);
  const to = new Date(toStr);
  const nights = Math.max(1, Math.ceil((to - from) / 86400000) || 1);
  
  let websiteTotal = 0;
  let ownerTotal = 0;
  
  const policy = room.weekendPolicy || "mon_fri";
  
  for (let i = 0; i < nights; i++) {
    const d = new Date(from);
    d.setDate(d.getDate() + i);
    const dayOfWeek = d.getDay();
    
    let isWeekend = false;
    if (policy === "mon_thu") {
      isWeekend = [0, 5, 6].includes(dayOfWeek);
    } else {
      isWeekend = [0, 6].includes(dayOfWeek);
    }
    
    const webPrice = isWeekend ? (room.weekendPrice || room.price || 0) : (room.weekdayPrice || room.price || 0);
    const ownPrice = isWeekend ? (room.weekendOwnerPrice || room.weekdayOwnerPrice || 0) : (room.weekdayOwnerPrice || 0);
    
    websiteTotal += webPrice + occupancySurcharge(room, getLocalDateString(d));
    ownerTotal += ownPrice;
  }
  
  const total = websiteTotal * numRooms;
  const ownerTotalVal = ownerTotal * numRooms;
  const profit = total - ownerTotalVal;
  
  return {
    nights,
    perDay: Math.round(websiteTotal / nights),
    total,
    ownerTotal: ownerTotalVal,
    profit
  };
}

function bookedRoomsOnDate(room, dateStr) {
  return allBookings.reduce((total, booking) => {
    const isSameRoom = String(booking.room_id) === String(room.id);
    const isBooked = booking.check_in <= dateStr && booking.check_out > dateStr;
    return isSameRoom && isBooked ? total + Number(booking.num_rooms || 1) : total;
  }, 0);
}

function occupancySurcharge(room, dateStr) {
  const totalRooms = Number(room.availableRooms || 0);
  if (!totalRooms) return 0;
  const occupancy = bookedRoomsOnDate(room, dateStr) / totalRooms;
  if (occupancy >= 0.9) return pricingSettings.occupancy90Surcharge;
  if (occupancy >= 0.8) return pricingSettings.occupancy80Surcharge;
  return 0;
}

function getAvailableRoomsCount(room, details = null) {
  const today = new Date();
  const fromStr = details?.from || getLocalDateString(today);
  const toStr = details?.to || getLocalDateString(new Date(today.getTime() + 86400000));
  
  // Filter active overlapping bookings for this room
  const overlapping = allBookings.filter(b => {
    const isSameRoom = String(b.room_id) === String(room.id);
    const overlaps = b.check_in < toStr && b.check_out > fromStr;
    return isSameRoom && overlaps;
  });
  
  // Calculate max booked rooms on any day in this range
  let maxBooked = 0;
  const start = new Date(fromStr);
  const end = new Date(toStr);
  const nights = Math.max(1, Math.ceil((end - start) / 86400000) || 1);
  
  for (let i = 0; i < nights; i++) {
    const d = new Date(start);
    d.setDate(d.getDate() + i);
    const dStr = getLocalDateString(d);
    
    let bookedOnDay = 0;
    overlapping.forEach(b => {
      if (b.check_in <= dStr && b.check_out > dStr) {
        bookedOnDay += Number(b.num_rooms || 1);
      }
    });
    
    if (bookedOnDay > maxBooked) {
      maxBooked = bookedOnDay;
    }
  }
  
  return Math.max(0, Number(room.availableRooms) - maxBooked);
}

function renderSummary() {
  bookingSummary.classList.add("hidden");
  bookingSummary.innerHTML = "";
}

function defaultTripDetails() {
  const today = getLocalDateString();
  return {
    from: today,
    to: getNextDateString(today),
    adults: 2,
    children: 0,
    rooms: 1
  };
}

function validateTripValues({ from, to, adults, children }) {
  if (!from || !to) return "Please select check-in and check-out dates.";
  if (to <= from) return "Check-out date must be after check-in date.";
  if (!positiveWholeNumber(adults) || Number(adults) < 1) return "Adults must be a whole number of at least 1.";
  if (!positiveWholeNumber(children) || Number(children) < 0) return "Kids must be a whole number of 0 or more.";
  return "";
}

function applyTripDetails({ from, to, adults, children }) {
  const error = validateTripValues({ from, to, adults, children });
  if (error) {
    alert(error);
    return false;
  }
  bookingDetails = {
    ...bookingDetails,
    from,
    to,
    adults: Number(adults),
    children: Number(children),
    rooms: 1
  };
  setStore("stayBookingDetails", bookingDetails);
  render();
  return true;
}

function syncTripDetails(details, { alertErrors = false } = {}) {
  const error = validateTripValues(details);
  if (error) {
    if (alertErrors) alert(error);
    return false;
  }
  bookingDetails = {
    ...bookingDetails,
    ...details,
    adults: Number(details.adults),
    children: Number(details.children),
    rooms: Number(details.rooms || bookingDetails?.rooms || 1)
  };
  setStore("stayBookingDetails", bookingDetails);
  return true;
}

function checkoutDetailsFromForm() {
  return {
    adults: document.querySelector("#adultsInput").value,
    children: document.querySelector("#childrenInput").value,
    rooms: document.querySelector("#roomsInput").value,
    from: document.querySelector("#fromInput").value,
    to: document.querySelector("#toInput").value,
    payment: document.querySelector("#paymentInput").value,
    travelInterest: travelInterestInput.checked,
    firecamp: firecampInput.checked
  };
}

function refreshAvailabilityUI(room = null) {
  if (feed && !feed.closest(".hidden")) renderFeed();
  renderProfile();
  if (room && modal?.open) renderCheckoutSummary(room, checkoutDetailsFromForm());
  if (window.lucide) lucide.createIcons();
}

function scheduleAvailabilityRefresh(room = null) {
  clearTimeout(availabilityRefreshTimer);
  availabilityRefreshTimer = setTimeout(async () => {
    if (supabaseClient) await loadAllBookings();
    refreshAvailabilityUI(room);
  }, 250);
}

function renderBookings() {
  bookingsList.innerHTML = bookings.length ? bookings.map((booking, index) => `
    <article class="booking-item">
      <img src="${escapeHtml(safeUrl(booking.roomImage || ""))}" alt="${escapeHtml(booking.roomName || "Booked room")}">
      <div>
        <h3>${escapeHtml(booking.roomName)}</h3>
        <p>${escapeHtml(booking.from)} to ${escapeHtml(booking.to)} &middot; ${escapeHtml(booking.adults)} adults &middot; ${escapeHtml(booking.rooms)} room(s)</p>
        <small>Ref: ${escapeHtml(booking.reference || bookingReference(booking.id))} &middot; ${booking.payment === "100" ? "Paid 100%" : "Paid 20% advance"}</small>
      </div>
      <div class="booking-actions"><span>${escapeHtml(booking.status)}</span><button class="ghost-btn" data-booking-index="${index}" type="button">View Details</button></div>
    </article>
  `).join("") : `<div class="empty">No bookings yet. Book a stay from Home.</div>`;
}

function openBookingDetails(index) {
  const booking = bookings[Number(index)];
  if (!booking || !bookingDetailsModal) return;
  bookingDetailsContent.innerHTML = `
    <p><strong>${escapeHtml(booking.roomName)}</strong></p>
    <p>Ref: ${escapeHtml(booking.reference || bookingReference(booking.id))}</p>
    <p>${escapeHtml(booking.from)} to ${escapeHtml(booking.to)}</p>
    <p>${escapeHtml(booking.adults)} adults &middot; ${escapeHtml(booking.children || 0)} kids &middot; ${escapeHtml(booking.rooms)} room(s)</p>
    <p>${booking.payment === "100" ? "Paid 100%" : "Paid 20% advance"}</p>
    <p>Status: ${escapeHtml(booking.status)}</p>
  `;
  bookingDetailsModal.showModal();
}

function showSuccess(message) {
  if (!successModal) return alert(message);
  successMessageText.textContent = message;
  successModal.showModal();
}

function renderProfile() {
  document.querySelector("#profileName").value = profile.name || "";
  document.querySelector("#profilePhone").value = profile.phone || "";
  document.querySelector("#profileEmail").value = profile.email || "";
  savedDetails.textContent = bookingDetails
    ? `${bookingDetails.adults} adults, ${bookingDetails.children} children, ${bookingDetails.rooms} rooms, ${bookingDetails.from} to ${bookingDetails.to}`
    : "No booking details saved yet.";
  const likedRooms = rooms.filter(room => likes.includes(room.id));
  likedList.innerHTML = likedRooms.length ? likedRooms.map(room => `<p>${escapeHtml(room.name)} &middot; ${escapeHtml(room.type)}</p>`).join("") : "No liked stays yet.";
}

function profileFromUser(user) {
  const meta = user?.user_metadata || {};
  const authUserKey = user?.id || user?.email || "";
  const previousAuthUserKey = localStorage.getItem("stayAuthUserKey");
  if (authUserKey && previousAuthUserKey !== authUserKey) {
    bookings = [];
    bookingDetails = null;
    profile = {};
    localStorage.removeItem("stayBookings");
    localStorage.removeItem("stayBookingDetails");
    localStorage.removeItem("stayProfile");
    localStorage.setItem("stayAuthUserKey", authUserKey);
  }
  profile = {
    ...profile,
    name: meta.full_name || meta.name || profile.name || "",
    email: user?.email || profile.email || ""
  };
  setStore("stayProfile", profile);
  saveCustomerProfile().catch(() => {});
}

async function saveCustomerProfile() {
  if (!supabaseClient) return { error: null };
  return supabaseClient.rpc("upsert_customer_profile", {
    p_name: profile.name || "",
    p_email: profile.email || "",
    p_phone: profile.phone || ""
  });
}

async function createMockBooking(room, details, pricing, status = "confirmed", screenshotUrl = "") {
  if (!supabaseClient) return Date.now();
  const { data: sessionData } = await supabaseClient.auth.getSession();
  const response = await fetch("/api/manual-booking", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${sessionData.session?.access_token || ""}`
    },
    body: JSON.stringify({
      p_room_id: room.id,
      p_customer_name: details.name || profile.name || "Customer",
      p_customer_phone: details.phone || profile.phone || "9999999999",
      p_customer_email: details.email || profile.email || "customer@stay.com",
      p_check_in: details.from,
      p_check_out: details.to,
      p_num_rooms: details.rooms,
      p_num_adults: details.adults,
      p_num_kids: details.children,
      p_payment_option: details.payment,
      p_status: status,
      p_influencer_id: localStorage.getItem("influencer_id") || null,
      p_firecamp: details.firecamp,
      p_screenshot_url: screenshotUrl
    })
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.error || "Booking could not be confirmed.");
  return result.id || Date.now();
}

async function uploadPaymentScreenshot(file, bookingId) {
  if (!file) return "";
  validateImageFile(file);
  return fileToDataUrl(file);
}

function setManualPaymentLinks(amount, room) {
  const upiId = (paymentSettings.upiId || "").trim();
  const reference = `SM${Date.now().toString().slice(-8)}`;
  const params = new URLSearchParams({
    pa: upiId,
    pn: "StayAtMaredumilli",
    am: Number(amount || 0).toFixed(2),
    cu: "INR",
    tr: reference,
    tn: `${room?.name || "Stay"} booking`
  });
  const disabled = !upiId || amount <= 0;
  const query = params.toString();
  const genericUrl = `upi://pay?${query}`;
  const phonePeUrl = `phonepe://pay?${query}`;
  [manualPhonePeLink, manualUpiLink].forEach(link => {
    if (!link) return;
    link.classList.toggle("disabled", disabled);
    link.setAttribute("aria-disabled", disabled ? "true" : "false");
    link.dataset.paymentUrl = disabled ? "" : genericUrl;
  });
  if (manualPhonePeLink) {
    manualPhonePeLink.href = disabled ? "javascript:void(0)" : phonePeUrl;
    manualPhonePeLink.dataset.paymentUrl = disabled ? "" : phonePeUrl;
  }
  if (manualUpiLink) manualUpiLink.href = disabled ? "javascript:void(0)" : genericUrl;
}

function openUpiPayment(event) {
  const link = event.target.closest("[data-payment-url]");
  if (!link) return;
  event.preventDefault();
  const url = link.dataset.paymentUrl;
  if (!url) {
    alert("UPI ID is not set yet. Please contact support.");
    return;
  }
  sessionStorage.setItem("stayUpiOpenedAt", String(Date.now()));
  if (selectedRoomId) localStorage.setItem("stayPendingRoomId", selectedRoomId);
  window.location.href = url;
  setTimeout(() => {
    if (document.visibilityState === "visible") alert("If your payment app did not open, copy the UPI ID shown here and pay manually, then upload the screenshot.");
  }, 1800);
}

function recoverFromUpiReturn() {
  const openedAt = Number(sessionStorage.getItem("stayUpiOpenedAt") || 0);
  if (!openedAt || document.visibilityState === "hidden" || Date.now() - openedAt < 1000) return;
  sessionStorage.removeItem("stayUpiOpenedAt");
  landing.classList.add("hidden");
  app.classList.remove("hidden");
  showScreen("#home");
  openPendingBookingIfReady();
}

async function captureWaitlist(room) {
  const phone = prompt("Rooms are full for this date. Share your mobile number; our team will call within 15 minutes and check nearby local rooms.");
  if (!phone) return;
  if (!supabaseClient) return alert("Thanks. Our team will contact you.");
  const { error } = await supabaseClient.rpc("create_room_lead", {
    p_room_id: room.id,
    p_phone: phone,
    p_check_in: bookingDetails?.from || getLocalDateString(),
    p_check_out: bookingDetails?.to || getNextDateString(bookingDetails?.from || getLocalDateString())
  });
  alert(error ? error.message : "Thanks. Our team will contact you within 15 minutes.");
}

async function saveTravelInterestLead(room, details) {
  const phone = details.phone || profile.phone;
  if (!supabaseClient || !phone) return false;
  const { error } = await supabaseClient.rpc("create_room_lead", {
    p_room_id: room.id,
    p_phone: phone,
    p_check_in: details.from,
    p_check_out: details.to
  });
  return !error;
}

function openSearchQuery() {
  const todayStr = getLocalDateString();
  const searchFrom = document.querySelector("#searchFrom");
  const searchTo = document.querySelector("#searchTo");
  const searchAdults = document.querySelector("#searchAdults");
  const searchKids = document.querySelector("#searchKids");
  if (searchFrom) {
    searchFrom.min = todayStr;
    searchFrom.value = bookingDetails?.from || searchFrom.value || todayStr;
  }
  if (searchTo) {
    searchTo.min = getNextDateString(searchFrom?.value || todayStr);
    searchTo.value = bookingDetails?.to || searchTo.value || searchTo.min;
  }
  if (searchAdults) searchAdults.value = bookingDetails?.adults || searchAdults.value || 2;
  if (searchKids) searchKids.value = bookingDetails?.children || searchKids.value || 0;
  document.querySelector("#searchQueryModal")?.showModal();
}

function enterApp(showSearch = true) {
  landing.classList.add("hidden");
  app.classList.remove("hidden");
  showScreen(location.hash || "#home");
  if (showSearch && !bookingDetails && !pendingBookingId()) openSearchQuery();
}

async function resumeSession(showSearch = false) {
  if (!supabaseClient) return false;
  const { data, error } = await supabaseClient.auth.getSession();
  if (!data.session) return false;
  profileFromUser(data.session.user);
  enterApp(showSearch);
  render();
  return true;
}

async function signOutOtherCustomerSessions(session) {
  const key = `staySignedOutOthers:${session?.user?.id}:${session?.access_token?.slice(-12)}`;
  if (!supabaseClient || !session || sessionStorage.getItem(key)) return;
  sessionStorage.setItem(key, "1");
  await supabaseClient.auth.signOut({ scope: "others" }).catch(() => {});
}

async function consumeAuthHash() {
  if (!supabaseClient || !location.hash.includes("access_token=")) return false;
  const params = new URLSearchParams(location.hash.slice(1));
  const access_token = params.get("access_token");
  const refresh_token = params.get("refresh_token");
  if (!access_token || !refresh_token) return false;
  const { data, error } = await supabaseClient.auth.setSession({ access_token, refresh_token });
  history.replaceState({}, "", location.origin + location.pathname);
  if (error || !data.session) return false;
  profileFromUser(data.session.user);
  await signOutOtherCustomerSessions(data.session);
  enterApp(!bookingDetails);
  render();
  return true;
}

function renderAdminRooms() {
  adminRoomList.innerHTML = ownerRooms.length ? ownerRooms.map(room => `
    <article class="admin-room-item">
      <img src="${room.images[0]}" alt="${room.name}">
      <div>
        <strong>${room.name}</strong>
        <p>${room.type} · ${room.availableRooms} rooms · max ${room.maxAdults} adults · Rs.${room.weekdayPrice}/Rs.${room.weekendPrice}</p>
      </div>
      <button class="ghost-btn" data-action="deleteOwnerRoom" data-room="${room.id}" type="button">Delete</button>
    </article>
  `).join("") : "No rooms added yet.";
}

function roomFromSupabase(row) {
  return {
    id: row.id,
    type: row.room_type,
    name: row.room_name,
    location: "Maredumilli",
    price: row.weekday_price,
    weekdayPrice: row.weekday_price,
    weekendPrice: row.weekend_price,
    weekdayOwnerPrice: row.weekday_owner_price || 0,
    weekendOwnerPrice: row.weekend_owner_price || 0,
    weekendPolicy: row.weekend_policy || "mon_fri",
    availableRooms: row.available_rooms,
    maxAdults: row.max_adults,
    rating: 4.6,
    reviews: 0,
    likes: 0,
    tags: ["available", "family"],
    status: `${row.available_rooms} rooms available`,
    images: row.image_urls?.length ? row.image_urls : ["https://images.unsplash.com/photo-1448375240586-882707db888b?auto=format&fit=crop&w=1000&q=80"],
    amenities: row.amenities || [],
    specialAttention: row.special_attention || ""
  };
}

function openBooking(roomId, editOnly = false) {
  selectedRoomId = roomId || selectedRoomId || rooms[0].id;
  editingDetailsOnly = editOnly;
  const room = rooms.find(item => item.id === selectedRoomId);
  modalTitle.textContent = editOnly ? "Edit saved details" : `Confirm ${room.name}`;
  const today = new Date();
  const tomorrow = new Date(Date.now() + 86400000);
  const defaults = fitDetailsToAvailability(room, bookingDetails || {
    adults: 2,
    children: 0,
    rooms: 1,
    from: getLocalDateString(today),
    to: getLocalDateString(tomorrow),
    payment: "20",
    firecamp: false
  });
  if (!defaults.to || defaults.to <= defaults.from) defaults.to = getNextDateString(defaults.from);
  document.querySelector("#bookingName").value = defaults.name || profile.name || "";
  document.querySelector("#bookingPhone").value = defaults.phone || profile.phone || "";
  document.querySelector("#bookingEmail").value = defaults.email || profile.email || "";
  document.querySelector("#adultsInput").value = defaults.adults;
  document.querySelector("#childrenInput").value = defaults.children;
  document.querySelector("#roomsInput").value = defaults.rooms;
  document.querySelector("#roomsInput").max = defaults.maxRooms || "";
  document.querySelector("#fromInput").value = defaults.from;
  document.querySelector("#toInput").min = getNextDateString(defaults.from);
  document.querySelector("#toInput").value = defaults.to;
  document.querySelector("#paymentInput").value = defaults.payment || "20";
  if (policyConsentInput) policyConsentInput.checked = false;
  travelInterestInput.checked = Boolean(defaults.travelInterest);
  firecampInput.checked = Boolean(defaults.firecamp) && hasFirecamp(room);
  renderCheckoutSummary(room, defaults);
  modal.showModal();
}

function renderCheckoutSummary(room, details) {
  const fitted = fitDetailsToAvailability(room, details);
  const roomsInput = document.querySelector("#roomsInput");
  const adultsInput = document.querySelector("#adultsInput");
  const submitBtn = bookingForm.querySelector('button[type="submit"]');
  if (adultsInput) adultsInput.value = fitted.adults;
  if (roomsInput) {
    roomsInput.value = fitted.rooms;
    roomsInput.max = fitted.maxRooms || "";
  }
  if (submitBtn) submitBtn.disabled = !fitted.maxRooms;
  const pricing = priceForDates(room, fitted);
  const selectedRooms = Number(fitted.rooms || 1);
  const roomTotal = pricing.total;
  const firecampAmount = firecampPrice(selectedRooms);
  const firecampTotal = firecampInput.checked && hasFirecamp(room) ? firecampAmount : 0;
  const total = roomTotal + firecampTotal;
  const paymentPercent = Number(document.querySelector("#paymentInput")?.value || fitted.payment || 20);
  const payNow = Math.round(total * paymentPercent / 100);
  const manualMode = paymentSettings.mode !== "razorpay" && paymentSettings.mode !== "mock";
  manualPaymentBox?.classList.toggle("hidden", !manualMode);
  if (manualUpiId) manualUpiId.textContent = paymentSettings.upiId || "UPI ID not set";
  if (paymentScreenshotInput) paymentScreenshotInput.required = manualMode;
  if (manualMode) setManualPaymentLinks(payNow, room);
  firecampField.classList.toggle("hidden", !hasFirecamp(room));
  firecampField.lastChild.textContent = ` Add firecamp for Rs.${firecampAmount.toLocaleString("en-IN")}`;
  bookingRoomSummary.innerHTML = `
    <img src="${escapeHtml(safeUrl(room.images[0]))}" alt="${escapeHtml(room.name)}">
    <div>
      <strong>${escapeHtml(room.name)}</strong>
      <p>${escapeHtml(room.type)} &middot; Rs.${pricing.perDay.toLocaleString("en-IN")} per room/day</p>
      <span>Check-in 11:00 AM &middot; Check-out 10:00 AM next day</span>
    </div>
  `;
  billSummary.innerHTML = `
    <strong>Bill summary</strong>
    <p>${pricing.nights} night(s) x ${selectedRooms} room(s): Rs.${roomTotal.toLocaleString("en-IN")}</p>
    ${firecampTotal ? `<p>Firecamp add-on: Rs.${firecampTotal.toLocaleString("en-IN")}</p>` : ""}
    <p>Adults: ${fitted.adults || 1} &middot; Kids: ${fitted.children || 0}</p>
    ${fitted.partialFit ? `<p class="capacity-warning">Booking ${fitted.maxAdults} adult(s) here. Please book the remaining ${fitted.requestedAdults - fitted.maxAdults} adult(s) in another hotel.</p>` : ""}
    <b>Total: Rs.${total.toLocaleString("en-IN")}</b>
    <b>Pay now (${paymentPercent}%): Rs.${payNow.toLocaleString("en-IN")}</b>
    ${manualMode ? `<p>After payment, upload the screenshot below. Our team confirms manually within 10 minutes.</p>` : ""}
  `;
}
function syncSlideFromScroll(slider) {
  const roomId = slider.closest(".carousel")?.dataset.room;
  if (!roomId) return;
  slides[roomId] = Math.round(slider.scrollLeft / slider.clientWidth);
  slider.closest(".carousel").querySelectorAll(".dots span").forEach((dot, index) => dot.classList.toggle("active", index === slides[roomId]));
}

function updateRoomCard(room) {
  const carousel = Array.from(document.querySelectorAll(".carousel")).find(item => item.dataset.room === room.id);
  if (!carousel) return;
  const image = carousel.querySelectorAll(".slides img")[slides[room.id]];
  if (image?.dataset.src && !image.src) image.src = image.dataset.src;
  carousel.querySelector(".slides").style.transform = `translateX(-${slides[room.id] * 100}%)`;
  carousel.querySelectorAll(".dots span").forEach((dot, index) => dot.classList.toggle("active", index === slides[room.id]));
  const heart = carousel.querySelector(".heart");
  heart.classList.toggle("liked", likes.includes(room.id));
  heart.querySelector("span").textContent = formatLikes(totalLikes(room));
}

function resetCarouselImages() {
  if (!rooms.some(room => slides[room.id] > 0)) return;
  rooms.forEach(room => {
    slides[room.id] = 0;
    updateRoomCard(room);
  });
  document.querySelectorAll(".slides").forEach(slider => {
    slider.scrollLeft = 0;
  });
}

let scrollResetTimer = null;
function resetCarouselImagesAfterScroll() {
  clearTimeout(scrollResetTimer);
  scrollResetTimer = setTimeout(resetCarouselImages, 120);
}

document.addEventListener("click", event => {
  const button = event.target.closest("[data-action]");
  if (!button) return;
  const room = rooms.find(item => item.id === button.dataset.room);
  if (button.dataset.action === "like") {
    likes = likes.includes(room.id) ? likes.filter(id => id !== room.id) : [...likes, room.id];
    setStore("stayLikes", likes);
    updateRoomCard(room);
    return;
  }
  if (button.dataset.action === "prev" || button.dataset.action === "next") {
    const step = button.dataset.action === "next" ? 1 : -1;
    slides[room.id] = (slides[room.id] + step + room.images.length) % room.images.length;
    updateRoomCard(room);
    return;
  }
  if (button.dataset.action === "toggleAmenities") {
    expandedAmenities = expandedAmenities.includes(room.id) ? expandedAmenities.filter(id => id !== room.id) : [...expandedAmenities, room.id];
  }
  if (button.dataset.action === "book") openBooking(room.id);
  if (button.dataset.action === "waitlist") captureWaitlist(room);
  if (button.dataset.action === "editDetails") openBooking(null, true);
  if (button.dataset.action === "openReel") openReel(Number(button.dataset.reel));
  if (button.dataset.action === "deleteOwnerRoom") {
    deleteOwnerRoom(button.dataset.room);
  }
  render();
});

adminRoomForm?.addEventListener("submit", async event => {
  event.preventDefault();
  const files = Array.from(document.querySelector("#adminImages").files);
  const images = files.length ? await uploadRoomImages(files) : [defaultRooms[0].images[0]];
  const amenities = Array.from(adminRoomForm.querySelectorAll(".amenity-checks input:checked")).map(input => input.value);
  const weekdayPrice = Number(document.querySelector("#adminWeekdayPrice").value);
  const roomInput = {
    type: document.querySelector("#adminRoomType").value,
    name: document.querySelector("#adminRoomName").value,
    weekdayPrice,
    weekendPrice: Number(document.querySelector("#adminWeekendPrice").value),
    availableRooms: Number(document.querySelector("#adminAvailableRooms").value),
    maxAdults: Number(document.querySelector("#adminMaxAdults").value),
    images,
    amenities,
    specialAttention: document.querySelector("#adminSpecialAttention").value
  };
  if (supabaseClient) {
    const { error } = await supabaseClient.from("rooms").insert({
      room_name: roomInput.name,
      room_type: roomInput.type,
      available_rooms: roomInput.availableRooms,
      max_adults: roomInput.maxAdults,
      weekday_price: roomInput.weekdayPrice,
      weekend_price: roomInput.weekendPrice,
      amenities: roomInput.amenities,
      special_attention: roomInput.specialAttention,
      image_urls: roomInput.images
    });
    if (error) {
      alert(error.message);
      return;
    }
    await loadOwnerRooms();
  } else {
    ownerRooms = [localOwnerRoom(roomInput), ...ownerRooms];
    setStore("stayOwnerRooms", ownerRooms);
  }
  adminRoomForm.reset();
  render();
});

function localOwnerRoom(input) {
  return {
    id: `owner-${Date.now()}`,
    type: input.type,
    name: input.name,
    location: "Maredumilli",
    price: input.weekdayPrice,
    weekdayPrice: input.weekdayPrice,
    weekendPrice: input.weekendPrice,
    availableRooms: input.availableRooms,
    maxAdults: input.maxAdults,
    rating: 4.6,
    reviews: 0,
    likes: 0,
    tags: ["available", "family"],
    status: `${input.availableRooms} rooms available`,
    images: input.images,
    amenities: input.amenities.join(", "),
    specialAttention: input.specialAttention
  };
}

async function uploadRoomImages(files) {
  if (!supabaseClient) return Promise.all(files.map(fileToDataUrl));
  const urls = [];
  for (const file of files) {
    validateImageFile(file);
    const path = `rooms/${Date.now()}-${file.name.replace(/[^a-z0-9.]/gi, "-")}`;
    const { error } = await supabaseClient.storage
      .from(supabaseConfig.roomBucket || "room-images")
      .upload(path, file, { upsert: true });
    if (error) throw error;
    const { data } = supabaseClient.storage
      .from(supabaseConfig.roomBucket || "room-images")
      .getPublicUrl(path);
    urls.push(data.publicUrl);
  }
  return urls;
}

async function deleteOwnerRoom(id) {
  if (supabaseClient) {
    const { error } = await supabaseClient.from("rooms").update({ active: false }).eq("id", id);
    if (error) alert(error.message);
    await loadOwnerRooms();
  } else {
    ownerRooms = ownerRooms.filter(item => item.id !== id);
    setStore("stayOwnerRooms", ownerRooms);
  }
  render();
}

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function loadRazorpayCheckout() {
  if (window.Razorpay) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "https://checkout.razorpay.com/v1/checkout.js";
    script.onload = resolve;
    script.onerror = () => reject(new Error("Could not load Razorpay checkout."));
    document.head.appendChild(script);
  });
}

async function startRazorpayPayment(order, details, room, pricing) {
  await loadRazorpayCheckout();
  return new Promise((resolve, reject) => {
    const checkout = new Razorpay({
      key: order.key_id,
      amount: order.amount * 100,
      currency: "INR",
      name: "Stay@Maredumilli",
      description: `${room.name} booking`,
      order_id: order.order_id,
      prefill: {
        name: details.name || profile.name || "",
        email: details.email || profile.email || "",
        contact: details.phone || profile.phone || ""
      },
      notes: {
        hold_id: order.hold_id,
        room_id: room.id
      },
      handler: async response => {
        try {
          const verify = await fetch("/api/verify-payment", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              hold_id: order.hold_id,
              razorpay_order_id: response.razorpay_order_id,
              razorpay_payment_id: response.razorpay_payment_id,
              razorpay_signature: response.razorpay_signature
            })
          });
          const data = await verify.json().catch(() => ({}));
          if (!verify.ok) throw new Error(data.error || "Payment verification failed.");
          resolve(data.booking_id);
        } catch (error) {
          reject(error);
        }
      },
      modal: {
        ondismiss: () => reject(new Error("Payment was not completed. Rooms will be released after 5 minutes."))
      }
    });
    checkout.open();
  });
}

bookingForm.addEventListener("submit", async event => {
  event.preventDefault();
  if (policyConsentInput && !policyConsentInput.checked && !editingDetailsOnly) {
    alert("Please accept the Terms of Service and Cancellation Policy before payment.");
    return;
  }
  const room = rooms.find(item => item.id === selectedRoomId);
  const adults = Number(document.querySelector("#adultsInput").value);
  const minRooms = minRoomsForAdults(room, adults);
  const remaining = getAvailableRoomsCount(room, {
    from: document.querySelector("#fromInput").value,
    to: document.querySelector("#toInput").value
  });
  const selectedRooms = Math.min(Math.max(Number(document.querySelector("#roomsInput").value), minRooms), remaining);
  document.querySelector("#roomsInput").value = selectedRooms || 1;
  if (!remaining) {
    const maxAdultsAvailable = remaining * Math.max(1, Number(room.maxAdults || 1));
    alert(`Only ${remaining} room(s) are available here for these dates. This hotel can take up to ${maxAdultsAvailable} adult(s). Please reduce guests or book the remaining people in another hotel.`);
    return;
  }
  const pricing = priceForDates(room, {
    from: document.querySelector("#fromInput").value,
    to: document.querySelector("#toInput").value,
    rooms: selectedRooms
  });
  const guestName = document.querySelector("#bookingName").value.trim();
  const guestPhone = document.querySelector("#bookingPhone").value.trim();
  const guestEmail = document.querySelector("#bookingEmail").value.trim();
  const manualMode = paymentSettings.mode !== "razorpay" && paymentSettings.mode !== "mock";
  const screenshotFile = paymentScreenshotInput?.files?.[0] || null;
  if (manualMode && !paymentSettings.upiId?.trim() && !editingDetailsOnly) {
    alert("UPI payment is not configured yet. Please contact support.");
    return;
  }
  if (manualMode && !screenshotFile && !editingDetailsOnly) {
    alert("Please pay by UPI and upload the payment screenshot before confirming.");
    return;
  }

  bookingDetails = {
    name: guestName,
    phone: guestPhone,
    email: guestEmail,
    adults,
    children: Number(document.querySelector("#childrenInput").value),
    rooms: selectedRooms,
    from: document.querySelector("#fromInput").value,
    to: document.querySelector("#toInput").value,
    payment: document.querySelector("#paymentInput").value,
    travelInterest: travelInterestInput.checked,
    firecamp: firecampInput.checked && hasFirecamp(room)
  };
  setStore("stayBookingDetails", bookingDetails);
  let successMessage = "";
  if (!editingDetailsOnly) {
    const submitBtn = bookingForm.querySelector('button[type="submit"]');
    submitBtn.disabled = true;
    submitBtn.textContent = paymentSettings.mode === "razorpay" ? "Opening payment..." : "Submitting...";
    try {
      let bookingId;
      if (paymentSettings.mode === "razorpay") {
        const influencerId = localStorage.getItem("influencer_id");
        const holdResponse = await fetch("/api/create-payment-hold", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            p_room_id: room.id,
            p_customer_name: guestName || profile.name || "Customer",
            p_customer_phone: guestPhone || profile.phone || "9999999999",
            p_customer_email: guestEmail || profile.email || "customer@stay.com",
            p_check_in: bookingDetails.from,
            p_check_out: bookingDetails.to,
            p_num_rooms: bookingDetails.rooms,
            p_num_adults: bookingDetails.adults,
            p_num_kids: bookingDetails.children,
            p_payment_option: bookingDetails.payment,
            p_influencer_id: influencerId || null,
            p_firecamp: bookingDetails.firecamp
          })
        });
        const hold = await holdResponse.json().catch(() => ({}));
        if (!holdResponse.ok) throw new Error(hold.error || "Could not hold rooms for payment.");
        bookingId = await startRazorpayPayment(hold, bookingDetails, room, pricing);
      } else {
        const screenshotUrl = manualMode ? await uploadPaymentScreenshot(screenshotFile, null) : "";
        bookingId = await createMockBooking(room, bookingDetails, pricing, manualMode ? "pending_payment" : "confirmed", screenshotUrl);
        if (manualMode) {
          bookingDetails.paymentScreenshotUrl = screenshotUrl;
        }
      }
      bookings = [{
        ...bookingDetails,
        id: bookingId || Date.now(),
        reference: bookingReference(bookingId),
        roomName: room.name,
        roomImage: room.images[0],
        price: pricing.perDay,
        status: manualMode ? "Payment submitted" : "Confirmed"
      }, ...bookings];
      await loadAllBookings();
      setStore("stayBookings", bookings);
      const travelLeadSaved = bookingDetails.travelInterest
        ? await saveTravelInterestLead(room, bookingDetails)
        : false;
      successMessage = manualMode
        ? `Payment screenshot uploaded. Reference ID: ${bookingReference(bookingId)}. Your room is held now. Our team will verify payment and confirm or cancel the booking within 5-10 minutes.`
        : travelLeadSaved
          ? `Booking confirmed. Reference ID: ${bookingReference(bookingId)}. Welcome to Stay@Maredumilli! Our team will contact you one day before check-in about travel packages.`
          : `Booking confirmed. Reference ID: ${bookingReference(bookingId)}. Welcome to Stay@Maredumilli!`;
      submitBtn.disabled = false;
      submitBtn.textContent = "Pay & Confirm";
    } catch (error) {
      alert(friendlyBookingError(error.message));
      submitBtn.disabled = false;
      submitBtn.textContent = "Pay & Confirm";
      return;
    }
  }
  modal.close();
  if (editingDetailsOnly) {
    editingDetailsOnly = false;
    render();
  } else {
    location.hash = "#bookings";
    showScreen("#bookings");
  }
  if (successMessage) showSuccess(successMessage);
});

document.querySelector("#saveProfileBtn").addEventListener("click", async event => {
  const button = event.currentTarget;
  profile = {
    name: document.querySelector("#profileName").value,
    phone: document.querySelector("#profilePhone").value,
    email: document.querySelector("#profileEmail").value
  };
  setStore("stayProfile", profile);
  button.disabled = true;
  button.textContent = "Saving...";
  try {
    const { error } = await saveCustomerProfile();
    if (error) throw error;
    alert("Profile saved.");
  } catch (error) {
    alert(`Profile save failed: ${error.message}`);
  } finally {
    button.disabled = false;
    button.textContent = "Save Profile";
  }
});

document.querySelector("#editSavedDetailsBtn").addEventListener("click", () => openBooking(null, true));
document.querySelector("#closeModalBtn").addEventListener("click", () => modal.close());
modal.addEventListener("click", event => {
  if (event.target === modal) modal.close();
});
document.querySelector("#closeReelBtn").addEventListener("click", () => reelModal.close());
document.querySelector("#closeBookingDetailsBtn")?.addEventListener("click", () => bookingDetailsModal.close());
document.querySelector("#closeSuccessBtn")?.addEventListener("click", () => successModal.close());
manualPaymentBox?.addEventListener("click", openUpiPayment);
bookingsList.addEventListener("click", event => {
  const button = event.target.closest("[data-booking-index]");
  if (button) openBookingDetails(button.dataset.bookingIndex);
});
document.querySelector("#logoutBtn")?.addEventListener("click", async () => {
  if (!confirm("Log out from Stay@Maredumilli?")) return;
  await supabaseClient?.auth.signOut().catch(() => {});
  ["stayAuthUserKey", "stayProfile", "stayBookingDetails", "stayLoginStartedAt", "stay-customer-auth"].forEach(key => localStorage.removeItem(key));
  location.reload();
});
document.querySelector(".support-btn").addEventListener("click", () => {
  window.open("https://wa.me/919392439935", "_blank", "noopener");
});
document.querySelector("#filterToggle").addEventListener("click", () => document.querySelector("#controlsPanel").classList.toggle("hidden"));
document.querySelector("#editTripBtn").addEventListener("click", openSearchQuery);
document.querySelector("#applyFiltersBtn").addEventListener("click", () => {
  document.querySelector("#controlsPanel").classList.add("hidden");
  render();
});
["#adultsInput", "#childrenInput", "#roomsInput", "#fromInput", "#toInput", "#firecampInput"].forEach(selector => {
  document.querySelector(selector).addEventListener("input", (e) => {
    const room = rooms.find(item => item.id === selectedRoomId);
    if (!room) return;

    // Automatically calculate needed rooms based on max capacity per room
    if (e.target.id === "adultsInput") {
      const adultsVal = Number(e.target.value || 1);
      const remaining = getAvailableRoomsCount(room, {
        from: document.querySelector("#fromInput").value,
        to: document.querySelector("#toInput").value
      });
      document.querySelector("#roomsInput").value = Math.min(minRoomsForAdults(room, adultsVal), remaining || 1);
    }
    if (e.target.id === "fromInput") {
      const nextDate = getNextDateString(e.target.value);
      document.querySelector("#toInput").min = nextDate;
      document.querySelector("#toInput").value = nextDate;
    }

    const details = detailsForRoom(room, checkoutDetailsFromForm());
    syncTripDetails(details);
    renderCheckoutSummary(room, details);
    scheduleAvailabilityRefresh(room);
  });
});
feed.addEventListener("scroll", event => {
  if (event.target.classList.contains("slides")) syncSlideFromScroll(event.target);
}, true);
window.addEventListener("scroll", resetCarouselImagesAfterScroll, { passive: true });
video.addEventListener("loadeddata", () => video.classList.add("ready"));
video.addEventListener("error", () => video.classList.add("hidden"));
loginBtn.addEventListener("click", async () => {
  if (!supabaseConfig.url || !supabaseConfig.anonKey) {
    enterApp();
    return;
  }
  if (!supabaseClient) {
    alert("Google login is still loading. Please refresh and try again.");
    return;
  }
  loginBtn.disabled = true;
  localStorage.setItem("stayLoginStartedAt", String(Date.now()));
  const { error } = await supabaseClient.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo: siteUrl
    }
  });
  if (error) {
    loginBtn.disabled = false;
    alert(error.message || "Google login is not available yet.");
  }
});

const searchQueryForm = document.querySelector("#searchQueryForm");
if (searchQueryForm) {
  searchQueryForm.addEventListener("submit", (e) => {
    e.preventDefault();
    const fromVal = document.querySelector("#searchFrom").value;
    const toVal = document.querySelector("#searchTo").value || getNextDateString(fromVal);
    const adultsVal = document.querySelector("#searchAdults").value || 2;
    const kidsVal = document.querySelector("#searchKids").value || 0;
    if (applyTripDetails({ from: fromVal, to: toVal, adults: adultsVal, children: kidsVal })) {
      document.querySelector("#searchQueryModal")?.close();
    }
  });
}
window.addEventListener("hashchange", () => showScreen(location.hash || "#home"));
window.addEventListener("resize", setLandingVideo);
window.addEventListener("focus", recoverFromUpiReturn);
window.addEventListener("pageshow", recoverFromUpiReturn);
document.addEventListener("visibilitychange", recoverFromUpiReturn);
window.addEventListener("DOMContentLoaded", async () => {
  capturePendingBookingParam();
  const consumedHashSession = await consumeAuthHash();
  Promise.all([
    loadAllBookings(),
    loadHighlights(),
    loadPricingSettings(),
    loadPaymentSettings(),
    loadOwnerRooms()
  ]).then(() => {
    render();
    openPendingBookingIfReady();
    setLandingVideo();
  });
  const authCode = new URLSearchParams(location.search).get("code");
  if (authCode && supabaseClient) {
    const { error } = await supabaseClient.auth.exchangeCodeForSession(authCode);
    history.replaceState({}, "", location.origin + location.pathname + location.hash);
    if (error) console.error("Google login callback failed:", error.message);
  }
  const authError = new URLSearchParams(location.search).get("error_description");
  if (authError) {
    alert(decodeURIComponent(authError).replace(/\+/g, " "));
  }
  if (!consumedHashSession) resumeSession(false);
  setTimeout(() => resumeSession(false), 500);
  setTimeout(() => resumeSession(false), 2000);
  supabaseClient?.auth.onAuthStateChange(async (event, session) => {
    if (!session) return;
    profileFromUser(session.user);
    if (event === "SIGNED_IN") await signOutOtherCustomerSessions(session);
    enterApp();
    render();
    openPendingBookingIfReady();
  });
  
  // Set date constraints
  const todayStr = getLocalDateString();
  const fromInput = document.querySelector("#fromInput");
  const toInput = document.querySelector("#toInput");
  if (fromInput) fromInput.min = todayStr;
  if (toInput) toInput.min = todayStr;
  document.querySelector("#searchFrom")?.addEventListener("input", (event) => {
    const nextDate = getNextDateString(event.target.value);
    const searchTo = document.querySelector("#searchTo");
    if (searchTo) {
      searchTo.min = nextDate;
      searchTo.value = nextDate;
    }
  });
  ["#searchFrom", "#searchTo", "#searchAdults", "#searchKids"].forEach(selector => {
    document.querySelector(selector)?.addEventListener("input", () => {
      const details = {
        from: document.querySelector("#searchFrom").value,
        to: document.querySelector("#searchTo").value,
        adults: document.querySelector("#searchAdults").value || 2,
        children: document.querySelector("#searchKids").value || 0,
        rooms: 1
      };
      if (syncTripDetails(details)) scheduleAvailabilityRefresh();
    });
  });

  if (supabaseClient) {
    setupRealtime();
    
    const urlParams = new URLSearchParams(window.location.search);
    const refCode = urlParams.get('ref');
    if (refCode) {
      localStorage.setItem('influencer_ref_code', refCode);
      supabaseClient.rpc('increment_influencer_visits', { ref_code: refCode })
        .then(() => {
          return supabaseClient.rpc('resolve_influencer_ref', { ref_code: refCode });
        })
        .then(({ data }) => {
          if (data) {
            localStorage.setItem('influencer_id', data);
          }
        })
        .catch(err => console.error("Influencer tracking error:", err));
    }
  }
  if (window.lucide) lucide.createIcons();
});

function setupRealtime() {
  if (!supabaseClient) return;
  supabaseClient
    .channel("customer-realtime-sync")
    .on("postgres_changes", { event: "*", schema: "public", table: "bookings" }, () => {
      loadAllBookings().then(() => loadOwnerRooms().then(render));
    })
    .on("postgres_changes", { event: "*", schema: "public", table: "rooms" }, () => {
      loadOwnerRooms().then(render);
    })
    .on("postgres_changes", { event: "*", schema: "public", table: "site_settings" }, () => {
      Promise.all([loadPricingSettings(), loadPaymentSettings()]).then(render);
    })
    .subscribe();
}

async function loadHighlights() {
  if (!supabaseClient) return;
  const { data, error } = await supabaseClient
    .from("highlights")
    .select("*")
    .order("created_at", { ascending: true });
  if (error) {
    console.error("Failed to load highlights:", error.message);
    return;
  }
  highlightReels = data || [];
}
