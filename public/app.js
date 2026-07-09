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
const bookingForm = document.querySelector("#bookingForm");
const modalTitle = document.querySelector("#modalTitle");
const bookingRoomSummary = document.querySelector("#bookingRoomSummary");
const billSummary = document.querySelector("#billSummary");
const firecampField = document.querySelector("#firecampField");
const firecampInput = document.querySelector("#firecampInput");
const reelTitle = document.querySelector("#reelTitle");
const reelEmbed = document.querySelector("#reelEmbed");
const adminRoomForm = document.querySelector("#adminRoomForm");
const adminRoomList = document.querySelector("#adminRoomList");
const adminStatus = document.querySelector("#adminStatus");
const supabaseConfig = window.STAY_SUPABASE || {};
const supabaseClient = supabaseConfig.url && supabaseConfig.anonKey && window.supabase
  ? window.supabase.createClient(supabaseConfig.url, supabaseConfig.anonKey)
  : null;

function getLocalDateString(date = new Date()) {
  const offset = date.getTimezoneOffset();
  const localDate = new Date(date.getTime() - (offset * 60 * 1000));
  return localDate.toISOString().split("T")[0];
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
let scrollResetTimer = null;

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
    .from("rooms_with_owner_policy")
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
    .from("bookings")
    .select("*")
    .neq("status", "cancelled");
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
    <button class="highlight reel-highlight" data-action="openReel" data-reel="${index}" type="button" aria-label="Play ${reel.title}">
      <span class="reel-ring" style="background: linear-gradient(rgba(0,0,0,0.18), rgba(0,0,0,0.28)), url('${reel.image_url}') center/cover;"><i data-lucide="play"></i></span>
      <span>${reel.title}</span>
    </button>
  `).join("");
}

function openReel(index) {
  const reel = highlightReels[index];
  if (!reel) return;
  reelTitle.textContent = reel.title;
  reelEmbed.innerHTML = `
    <blockquote class="instagram-media" data-instgrm-permalink="${reel.url}" data-instgrm-version="14"></blockquote>
    <a class="ghost-btn reel-fallback" href="${reel.url}" target="_blank" rel="noopener">Open in Instagram</a>
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
      ${shown.map(item => `<span><i data-lucide="${amenityIcon(item)}"></i>${item}</span>`).join("")}
      ${rest.length ? `<button class="more-amenities" data-action="toggleAmenities" data-room="${room.id}" type="button"><i data-lucide="more-horizontal"></i>${expandedAmenities.includes(room.id) ? "Less" : `More ${rest.length}`}</button>` : ""}
    </div>
  `;
}

function renderFeed() {
  const list = filteredRooms();
  feed.innerHTML = list.length ? list.map(roomCard).join("") : `<div class="empty">No rooms available yet.</div>`;
}

function roomCard(room) {
  const liked = likes.includes(room.id);
  const index = slides[room.id];
  const remainingRooms = getAvailableRoomsCount(room, bookingDetails);
  
  return `
    <article class="room-card">
      <div class="carousel" data-room="${room.id}">
        <div class="slides" style="transform: translateX(-${index * 100}%);">
          ${room.images.map(src => `<img src="${src}" alt="${room.type}">`).join("")}
        </div>
        <button class="heart image-heart ${liked ? "liked" : ""}" data-action="like" data-room="${room.id}" aria-label="Like ${room.name}">
          <i data-lucide="heart"></i><span>${formatLikes(totalLikes(room))}</span>
        </button>
        <button class="slide-btn prev" data-action="prev" data-room="${room.id}" aria-label="Previous image"><i data-lucide="chevron-left"></i></button>
        <button class="slide-btn next" data-action="next" data-room="${room.id}" aria-label="Next image"><i data-lucide="chevron-right"></i></button>
        <div class="dots">${room.images.map((_, i) => `<span class="${i === index ? "active" : ""}"></span>`).join("")}</div>
      </div>
      <div class="room-body">
        <div class="room-title">
          <div>
            <p class="room-type">${room.type}</p>
            <button class="hotel-link" data-action="book" data-room="${room.id}" type="button">${room.name}</button>
          </div>
          ${amenityIcons(room)}
        </div>
        <div class="meta" style="display: flex; justify-content: space-between; align-items: center;">
          <span><i data-lucide="map-pin"></i>${room.location}</span>
          <span style="font-weight: 600; color: ${remainingRooms > 0 ? "var(--accent)" : "var(--danger)"};">
            ${remainingRooms > 0 ? `${remainingRooms} rooms left` : "Sold Out"}
          </span>
        </div>
        <div class="price-row">
          <strong>${priceLabel(room)} <small>per room/day</small></strong>
          ${remainingRooms > 0 
            ? `<button class="primary-btn" data-action="book" data-room="${room.id}" type="button">Book</button>`
            : `<button class="primary-btn" disabled style="background: #444; border-color: #444; cursor: not-allowed;" type="button">Sold Out</button>`
          }
        </div>
      </div>
    </article>
  `;
}

function priceLabel(room) {
  return `Rs.${priceForDates(room, bookingDetails).perDay.toLocaleString("en-IN")}`;
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
    
    websiteTotal += webPrice;
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

function renderBookings() {
  bookingsList.innerHTML = bookings.length ? bookings.map(booking => `
    <article class="booking-item">
      <img src="${booking.roomImage || ""}" alt="">
      <div>
        <h3>${booking.roomName}</h3>
        <p>${booking.from} to ${booking.to} &middot; ${booking.adults} adults &middot; ${booking.rooms} room(s)</p>
        <small>${booking.payment === "100" ? "Paid 100%" : "Paid 20% advance"}</small>
      </div>
      <div class="booking-actions"><span>${booking.status}</span><button class="ghost-btn" type="button">View Details</button></div>
    </article>
  `).join("") : `<div class="empty">No bookings yet. Book a stay from Home.</div>`;
}

function renderProfile() {
  document.querySelector("#profileName").value = profile.name || "";
  document.querySelector("#profilePhone").value = profile.phone || "";
  document.querySelector("#profileEmail").value = profile.email || "";
  savedDetails.textContent = bookingDetails
    ? `${bookingDetails.adults} adults, ${bookingDetails.children} children, ${bookingDetails.rooms} rooms, ${bookingDetails.from} to ${bookingDetails.to}`
    : "No booking details saved yet.";
  const likedRooms = rooms.filter(room => likes.includes(room.id));
  likedList.innerHTML = likedRooms.length ? likedRooms.map(room => `<p>${room.name} &middot; ${room.type}</p>`).join("") : "No liked stays yet.";
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
  const defaults = bookingDetails || {
    adults: 2,
    children: 0,
    rooms: 1,
    from: getLocalDateString(today),
    to: getLocalDateString(tomorrow),
    payment: "20",
    firecamp: false,
    coupon: ""
  };
  document.querySelector("#bookingName").value = defaults.name || profile.name || "";
  document.querySelector("#bookingPhone").value = defaults.phone || profile.phone || "";
  document.querySelector("#bookingEmail").value = defaults.email || profile.email || "";
  document.querySelector("#adultsInput").value = defaults.adults;
  document.querySelector("#childrenInput").value = defaults.children;
  document.querySelector("#roomsInput").value = defaults.rooms;
  document.querySelector("#fromInput").value = defaults.from;
  document.querySelector("#toInput").value = defaults.to;
  document.querySelector("#paymentInput").value = defaults.payment || "20";
  document.querySelector("#couponInput").value = defaults.coupon || "";
  firecampInput.checked = Boolean(defaults.firecamp) && hasFirecamp(room);
  renderCheckoutSummary(room, defaults);
  modal.showModal();
}

function renderCheckoutSummary(room, details) {
  const pricing = priceForDates(room, details);
  const selectedRooms = Number(details.rooms || 1);
  const roomTotal = pricing.total * selectedRooms;
  const firecampTotal = firecampInput.checked && hasFirecamp(room) ? 600 : 0;
  const total = roomTotal + firecampTotal;
  const weekdayOnly = isWeekdayOnly(details.from, details.to);
  document.querySelector("#couponField").classList.toggle("hidden", !weekdayOnly);
  firecampField.classList.toggle("hidden", !hasFirecamp(room));
  bookingRoomSummary.innerHTML = `
    <img src="${room.images[0]}" alt="${room.name}">
    <div>
      <strong>${room.name}</strong>
      <p>${room.type} &middot; Rs.${pricing.perDay.toLocaleString("en-IN")} per room/day</p>
      <span>Check-in 11:00 AM &middot; Check-out 10:00 AM next day</span>
    </div>
  `;
  billSummary.innerHTML = `
    <strong>Bill summary</strong>
    <p>${pricing.nights} night(s) x ${selectedRooms} room(s): Rs.${roomTotal.toLocaleString("en-IN")}</p>
    ${firecampTotal ? `<p>Firecamp add-on: Rs.${firecampTotal.toLocaleString("en-IN")}</p>` : ""}
    <p>Adults: ${details.adults || 1} &middot; Kids: ${details.children || 0}</p>
    <b>Total: Rs.${total.toLocaleString("en-IN")}</b>
  `;
}
function isWeekdayOnly(from, to) {
  const start = new Date(from);
  const end = new Date(to);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return false;
  for (let day = new Date(start); day < end; day.setDate(day.getDate() + 1)) {
    if ([0, 6].includes(day.getDay())) return false;
  }
  return true;
}

function syncSlideFromScroll(slider) {
  const roomId = slider.closest(".carousel")?.dataset.room;
  if (!roomId) return;
  slides[roomId] = Math.round(slider.scrollLeft / slider.clientWidth);
  slider.closest(".carousel").querySelectorAll(".dots span").forEach((dot, index) => dot.classList.toggle("active", index === slides[roomId]));
}

function resetCarouselImages() {
  for (const room of rooms) slides[room.id] = 0;
  document.querySelectorAll(".slides").forEach(slider => {
    slider.scrollLeft = 0;
    slider.style.transform = "translateX(0%)";
    syncSlideFromScroll(slider);
  });
}

document.addEventListener("click", event => {
  const button = event.target.closest("[data-action]");
  if (!button) return;
  const room = rooms.find(item => item.id === button.dataset.room);
  if (button.dataset.action === "like") {
    likes = likes.includes(room.id) ? likes.filter(id => id !== room.id) : [...likes, room.id];
    setStore("stayLikes", likes);
  }
  if (button.dataset.action === "prev" || button.dataset.action === "next") {
    const step = button.dataset.action === "next" ? 1 : -1;
    slides[room.id] = (slides[room.id] + step + room.images.length) % room.images.length;
  }
  if (button.dataset.action === "toggleAmenities") {
    expandedAmenities = expandedAmenities.includes(room.id) ? expandedAmenities.filter(id => id !== room.id) : [...expandedAmenities, room.id];
  }
  if (button.dataset.action === "book") openBooking(room.id);
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

bookingForm.addEventListener("submit", async event => {
  event.preventDefault();
  const room = rooms.find(item => item.id === selectedRoomId);
  const adults = Number(document.querySelector("#adultsInput").value);
  const selectedRooms = Number(document.querySelector("#roomsInput").value);
  if (adults > selectedRooms * room.maxAdults) {
    alert(`This room allows maximum ${room.maxAdults} adults per room. Please increase rooms or reduce adults.`);
    return;
  }
  const remaining = getAvailableRoomsCount(room, {
    from: document.querySelector("#fromInput").value,
    to: document.querySelector("#toInput").value
  });
  if (selectedRooms > remaining) {
    alert(`Only ${remaining} room(s) are available on these dates! Please reduce the room count.`);
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
    coupon: document.querySelector("#couponInput").value,
    firecamp: firecampInput.checked && hasFirecamp(room)
  };
  setStore("stayBookingDetails", bookingDetails);
  if (!editingDetailsOnly) {
    bookings = [{
      ...bookingDetails,
      id: Date.now(),
      roomName: room.name,
      roomImage: room.images[0],
      price: pricing.perDay,
      status: "Confirmed"
    }, ...bookings];
    setStore("stayBookings", bookings);

    // Save to shared database
    if (supabaseClient) {
      const influencerId = localStorage.getItem("influencer_id");
      const { error: dbError } = await supabaseClient.from("bookings").insert({
        room_id: room.id,
        customer_name: guestName || profile.name || "Customer",
        customer_phone: guestPhone || profile.phone || "9999999999",
        customer_email: guestEmail || profile.email || "customer@stay.com",
        check_in: bookingDetails.from,
        check_out: bookingDetails.to,
        num_rooms: bookingDetails.rooms,
        num_adults: bookingDetails.adults,
        num_kids: bookingDetails.children,
        total_price: pricing.total,
        owner_amount: pricing.ownerTotal,
        profit_amount: pricing.profit,
        status: "confirmed",
        influencer_id: influencerId || null
      });
      if (dbError) {
        console.error("Failed to insert booking to Supabase:", dbError.message);
      }
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
});

document.querySelector("#saveProfileBtn").addEventListener("click", () => {
  profile = {
    name: document.querySelector("#profileName").value,
    phone: document.querySelector("#profilePhone").value,
    email: document.querySelector("#profileEmail").value
  };
  setStore("stayProfile", profile);
});

document.querySelector("#editSavedDetailsBtn").addEventListener("click", () => openBooking(null, true));
document.querySelector("#closeModalBtn").addEventListener("click", () => modal.close());
document.querySelector("#closeReelBtn").addEventListener("click", () => reelModal.close());
document.querySelector("#copyRefBtn").addEventListener("click", () => navigator.clipboard?.writeText("MAREDU250"));
document.querySelector(".support-btn").addEventListener("click", () => alert("WhatsApp support will be connected after the number is provided."));
document.querySelector("#filterToggle").addEventListener("click", () => document.querySelector("#controlsPanel").classList.toggle("hidden"));
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
      const maxCap = room.maxAdults || 2;
      document.querySelector("#roomsInput").value = Math.ceil(adultsVal / maxCap);
    }

    renderCheckoutSummary(room, {
      adults: document.querySelector("#adultsInput").value,
      children: document.querySelector("#childrenInput").value,
      rooms: document.querySelector("#roomsInput").value,
      from: document.querySelector("#fromInput").value,
      to: document.querySelector("#toInput").value
    });
  });
});
feed.addEventListener("scroll", event => {
  if (event.target.classList.contains("slides")) syncSlideFromScroll(event.target);
}, true);
video.addEventListener("loadeddata", () => video.classList.add("ready"));
video.addEventListener("error", () => video.classList.add("hidden"));
loginBtn.addEventListener("click", () => {
  landing.classList.add("hidden");
  app.classList.remove("hidden");
  showScreen(location.hash || "#home");
  
  // Set date constraints on the search fields
  const todayStr = getLocalDateString();
  const searchFrom = document.querySelector("#searchFrom");
  const searchTo = document.querySelector("#searchTo");
  if (searchFrom) searchFrom.min = todayStr;
  if (searchTo) searchTo.min = todayStr;
  
  // Pre-fill default values for search fields (today & tomorrow)
  const tomorrow = new Date(Date.now() + 86400000);
  if (searchFrom && !searchFrom.value) searchFrom.value = todayStr;
  if (searchTo && !searchTo.value) searchTo.value = getLocalDateString(tomorrow);
  
  const searchQueryModal = document.querySelector("#searchQueryModal");
  if (searchQueryModal) searchQueryModal.showModal();
});

const searchQueryForm = document.querySelector("#searchQueryForm");
if (searchQueryForm) {
  searchQueryForm.addEventListener("submit", (e) => {
    e.preventDefault();
    const fromVal = document.querySelector("#searchFrom").value;
    const toVal = document.querySelector("#searchTo").value;
    const adultsVal = Number(document.querySelector("#searchAdults").value || 2);
    const kidsVal = Number(document.querySelector("#searchKids").value || 0);
    
    bookingDetails = {
      ...bookingDetails,
      from: fromVal,
      to: toVal,
      adults: adultsVal,
      children: kidsVal,
      rooms: 1
    };
    setStore("stayBookingDetails", bookingDetails);
    
    document.querySelector("#searchQueryModal")?.close();
    render();
  });
}
window.addEventListener("hashchange", () => showScreen(location.hash || "#home"));
window.addEventListener("scroll", () => {
  clearTimeout(scrollResetTimer);
  scrollResetTimer = setTimeout(resetCarouselImages, 120);
}, { passive: true });
window.addEventListener("resize", setLandingVideo);
window.addEventListener("DOMContentLoaded", () => {
  setLandingVideo();
  Promise.all([
    loadAllBookings(),
    loadHighlights()
  ]).then(() => {
    loadOwnerRooms().then(render);
  });
  
  // Set date constraints
  const todayStr = getLocalDateString();
  const fromInput = document.querySelector("#fromInput");
  const toInput = document.querySelector("#toInput");
  if (fromInput) fromInput.min = todayStr;
  if (toInput) toInput.min = todayStr;

  if (supabaseClient) {
    setupRealtime();
    
    const urlParams = new URLSearchParams(window.location.search);
    const refCode = urlParams.get('ref');
    if (refCode) {
      localStorage.setItem('influencer_ref_code', refCode);
      supabaseClient.rpc('increment_influencer_visits', { ref_code: refCode })
        .then(() => {
          return supabaseClient.from('influencers').select('id').eq('code', refCode.toLowerCase()).eq('active', true).single();
        })
        .then(({ data }) => {
          if (data) {
            localStorage.setItem('influencer_id', data.id);
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
