window.addEventListener("error", (e) => {
  console.error("JS Error:", e.message, e.filename, e.lineno);
});
window.addEventListener("unhandledrejection", (e) => {
  console.error("JS Promise Error:", e.reason);
});

const adminRoomForm = document.querySelector("#adminRoomForm");
const addHotelBtn = document.querySelector("#addHotelBtn");
const cancelRoomFormBtn = document.querySelector("#cancelRoomFormBtn");
const adminRoomList = document.querySelector("#adminRoomList");
const adminBlockForm = document.querySelector("#adminBlockForm");
const adminBlockRoom = document.querySelector("#adminBlockRoom");
const adminBlockFrom = document.querySelector("#adminBlockFrom");
const adminBlockTo = document.querySelector("#adminBlockTo");
const adminBlockRooms = document.querySelector("#adminBlockRooms");
const adminBlockHint = document.querySelector("#adminBlockHint");
const adminBlockList = document.querySelector("#adminBlockList");
const supabaseConfig = window.STAY_SUPABASE || {};

const supabaseClient = supabaseConfig.url && supabaseConfig.anonKey && window.supabase
  ? window.supabase.createClient(supabaseConfig.url, supabaseConfig.anonKey, {
      auth: { storageKey: "stay-admin-auth" }
    })
  : null;

const adminDashboard = document.querySelector("#adminDashboard");
const adminLogoutBtn = document.querySelector("#adminLogoutBtn");

const adminRoomOwner = document.querySelector("#adminRoomOwner");
const adminOwnerForm = document.querySelector("#adminOwnerForm");
const adminOwnerList = document.querySelector("#adminOwnerList");

const contentInventory = document.querySelector("#contentInventory");
const contentOwners = document.querySelector("#contentOwners");
const contentSales = document.querySelector("#contentSales");
const contentCustomers = document.querySelector("#contentCustomers");
const contentPricing = document.querySelector("#contentPricing");
const contentInfluencers = document.querySelector("#contentInfluencers");
const adminInfluencerList = document.querySelector("#adminInfluencerList");
const contentHighlights = document.querySelector("#contentHighlights");
const adminHighlightsList = document.querySelector("#adminHighlightsList");
const contentUpcoming = document.querySelector("#contentUpcoming");
const adminUpcomingList = document.querySelector("#adminUpcomingList");
const upcomingDaysFilter = document.querySelector("#upcomingDaysFilter");
const adminSectionSelect = document.querySelector("#adminSectionSelect");
const adminPricingForm = document.querySelector("#adminPricingForm");
const adminPaymentForm = document.querySelector("#adminPaymentForm");
const paymentMode = document.querySelector("#paymentMode");
const paymentUpiId = document.querySelector("#paymentUpiId");
const adminCustomerList = document.querySelector("#adminCustomerList");
const pricing80Surcharge = document.querySelector("#pricing80Surcharge");
const pricing90Surcharge = document.querySelector("#pricing90Surcharge");

const adminOwnerHotel = document.querySelector("#adminOwnerHotel");
const adminOwnerName = document.querySelector("#adminOwnerName");
const adminOwnerPhone = document.querySelector("#adminOwnerPhone");
const adminOwnerAltPhone = document.querySelector("#adminOwnerAltPhone");
const adminOwnerEmail = document.querySelector("#adminOwnerEmail");
const adminOwnerPassword = document.querySelector("#adminOwnerPassword");
const adminOwnerWeekendPolicy = document.querySelector("#adminOwnerWeekendPolicy");

const adminWeekdayOwnerPrice = document.querySelector("#adminWeekdayOwnerPrice");
const adminWeekendOwnerPrice = document.querySelector("#adminWeekendOwnerPrice");
const adminSalesList = document.querySelector("#adminSalesList");

function nextDate(dateStr) {
  const date = new Date(dateStr);
  date.setDate(date.getDate() + 1);
  return date.toISOString().slice(0, 10);
}

function addDays(date, days) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next.toISOString().slice(0, 10);
}

let ownerRooms = [];
let hotelOwners = [];
let allBookings = [];
let upcomingBookings = [];
let allCustomers = [];
let editingRoomId = null;
let currentRoomImages = [];

function openRoomForm() {
  editingRoomId = null;
  currentRoomImages = [];
  adminRoomForm.reset();
  renderImageOrderList();
  adminRoomForm.classList.remove("hidden");
  addHotelBtn?.classList.add("hidden");
  setSaving(false);
}

function closeRoomForm() {
  editingRoomId = null;
  currentRoomImages = [];
  adminRoomForm.reset();
  renderImageOrderList();
  adminRoomForm.classList.add("hidden");
  addHotelBtn?.classList.remove("hidden");
  setSaving(false);
}

async function loadRooms() {
  if (!supabaseClient) {
    setStatus("Backend not connected.");
    ownerRooms = [];
    renderRooms();
    return;
  }
  const { data, error } = await supabaseClient
    .from("rooms_with_owner_policy")
    .select("*")
    .eq("active", true)
    .order("created_at", { ascending: false });
  if (error) {
    setStatus(error.message, true);
    return;
  }
  ownerRooms = data || [];
  setStatus("Backend connected. Rooms and images save online.");
  renderRooms();
}

function renderRooms() {
  renderBlockRoomOptions();
  adminRoomList.innerHTML = ownerRooms.length ? ownerRooms.map(room => `
    <article class="admin-room-item">
      <img src="${escapeHtml(safeUrl(room.image_urls?.[0] || ""))}" alt="${escapeHtml(room.room_name)}">
      <div>
        <strong>${escapeHtml(room.room_name)}</strong>
        <p>${escapeHtml(room.room_type)} &middot; ${escapeHtml(room.available_rooms)} rooms &middot; max ${escapeHtml(room.max_adults)} adults</p>
        <p style="font-size: 12px; color: var(--muted); margin-top: 4px;">
          Weekday: Website Rs.${room.weekday_price} (Owner Payout: Rs.${room.weekday_owner_price || 0}) &middot; 
          Weekend: Website Rs.${room.weekend_price} (Owner Payout: Rs.${room.weekend_owner_price || 0})
        </p>
      </div>
      <div class="admin-actions">
        <button class="ghost-btn" data-edit="${escapeHtml(room.id)}" type="button">Edit</button>
        <button class="ghost-btn" data-delete="${escapeHtml(room.id)}" type="button">Delete</button>
      </div>
    </article>
  `).join("") : "No rooms added yet.";
  if (window.lucide) lucide.createIcons();
}

function renderBlockRoomOptions() {
  if (!adminBlockRoom) return;
  adminBlockRoom.innerHTML = ownerRooms.map(room => `<option value="${escapeHtml(room.id)}">${escapeHtml(room.room_name)} - ${escapeHtml(room.room_type)}</option>`).join("");
  updateBlockHint();
}

function availableForBlock(room, from, to) {
  if (!room || !from || !to) return 0;
  let maxBooked = 0;
  for (let day = new Date(from); day < new Date(to); day.setDate(day.getDate() + 1)) {
    const dayStr = day.toISOString().slice(0, 10);
    const booked = allBookings
      .filter(b => String(b.room_id) === String(room.id) && b.check_in <= dayStr && b.check_out > dayStr)
      .reduce((sum, b) => sum + Number(b.num_rooms || 1), 0);
    maxBooked = Math.max(maxBooked, booked);
  }
  return Math.max(0, Number(room.available_rooms || 0) - maxBooked);
}

function updateBlockHint() {
  if (!adminBlockHint || !adminBlockRoom) return;
  const room = ownerRooms.find(item => String(item.id) === String(adminBlockRoom.value));
  const available = availableForBlock(room, adminBlockFrom?.value, adminBlockTo?.value);
  adminBlockRooms.max = available || 1;
  adminBlockHint.textContent = room && adminBlockFrom?.value && adminBlockTo?.value
    ? `${available} room(s) free for selected dates.`
    : "";
}

function renderAdminBlocks() {
  if (!adminBlockList) return;
  const blocks = allBookings.filter(b => b.status === "offline_blocked");
  adminBlockList.innerHTML = blocks.length ? blocks.map(b => `
    <article class="admin-room-item">
      <div>
        <strong>${escapeHtml(b.hotel_name || b.room_name || "Blocked room")}</strong>
        <p>${escapeHtml(b.check_in)} to ${escapeHtml(b.check_out)} &middot; ${escapeHtml(b.num_rooms)} room(s)</p>
      </div>
      <div class="admin-actions">
        <button class="ghost-btn" data-release-block="${escapeHtml(b.id)}" type="button">Release</button>
      </div>
    </article>
  `).join("") : `<p class="muted-line">No blocked rooms right now.</p>`;
}

adminRoomForm.addEventListener("submit", async event => {
  event.preventDefault();
  if (!supabaseClient) return showError("Backend not connected.");
  setSaving(true);
  setStatus("Saving room and uploading images...");
  let imageUrls = [];
  try {
    const uploadPromises = currentRoomImages.map(async (img, idx) => {
      if (img.file) {
        const uploadedUrl = await uploadRoomImage(img.file);
        return { url: uploadedUrl, order: img.order ?? (idx + 1) };
      } else {
        return { url: img.url, order: img.order ?? (idx + 1) };
      }
    });
    const resolved = await Promise.all(uploadPromises);
    imageUrls = resolved
      .sort((a, b) => a.order - b.order)
      .map(img => img.url);
  } catch (error) {
    setSaving(false);
    return showError(error.message);
  }
  const amenities = Array.from(adminRoomForm.querySelectorAll(".amenity-checks input:checked")).map(input => input.value);
  const payload = {
    room_name: document.querySelector("#adminRoomName").value,
    room_type: document.querySelector("#adminRoomType").value,
    available_rooms: Number(document.querySelector("#adminAvailableRooms").value),
    max_adults: Number(document.querySelector("#adminMaxAdults").value),
    weekday_price: Number(document.querySelector("#adminWeekdayPrice").value),
    weekday_owner_price: Number(adminWeekdayOwnerPrice.value),
    weekend_price: Number(document.querySelector("#adminWeekendPrice").value),
    weekend_owner_price: Number(adminWeekendOwnerPrice.value),
    owner_id: adminRoomOwner && adminRoomOwner.value ? adminRoomOwner.value : null,
    amenities,
    special_attention: document.querySelector("#adminSpecialAttention").value,
    image_urls: imageUrls
  };
  const query = editingRoomId
    ? supabaseClient.from("rooms").update(payload).eq("id", editingRoomId)
    : supabaseClient.from("rooms").insert(payload);
  const { error } = await query;
  if (error) {
    setSaving(false);
    return showError(error.message);
  }
  editingRoomId = null;
  currentRoomImages = [];
  renderImageOrderList();
  adminRoomForm.reset();
  closeRoomForm();
  await loadRooms();
  setSaving(false);
  notifyAdmin("Saved. Room is now available on the customer site.");
  adminRoomList.scrollIntoView({ behavior: "smooth", block: "start" });
});

addHotelBtn?.addEventListener("click", () => openRoomForm(false));
cancelRoomFormBtn?.addEventListener("click", closeRoomForm);

adminRoomList.addEventListener("click", async event => {
  const editButton = event.target.closest("[data-edit]");
  if (editButton) return editRoom(editButton.dataset.edit);
  const button = event.target.closest("[data-delete]");
  if (!button || !supabaseClient) return;
  if (!confirm("Delete this room?")) return;
  const { error } = await supabaseClient.from("rooms").update({ active: false }).eq("id", button.dataset.delete);
  if (error) return notifyAdmin(error.message, true);
  await loadRooms();
  notifyAdmin("Room deleted from customer site.");
});

async function blockRoomFromAdmin(roomId, checkIn, checkOut, rooms) {
  const room = ownerRooms.find(item => String(item.id) === String(roomId));
  if (!room || !supabaseClient) return;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(checkIn) || !/^\d{4}-\d{2}-\d{2}$/.test(checkOut) || checkOut <= checkIn) {
    return alert("Enter valid dates. Release date must be after block date.");
  }
  const nights = Math.round((new Date(checkOut) - new Date(checkIn)) / 86400000);
  if (nights > 30) return alert("Block maximum 30 nights at once.");
  const available = availableForBlock(room, checkIn, checkOut);
  if (!Number.isInteger(rooms) || rooms < 1 || rooms > available) return alert(`Enter 1 to ${available} rooms only.`);
  if (!confirm(`Block ${rooms} room(s) in ${room.room_name} from ${checkIn} to ${checkOut}?`)) return;
  const { error } = await supabaseClient.rpc("create_booking_safe", {
    p_room_id: roomId,
    p_customer_name: "Admin offline block",
    p_customer_phone: "admin",
    p_customer_email: null,
    p_check_in: checkIn,
    p_check_out: checkOut,
    p_num_rooms: rooms,
    p_num_adults: 1,
    p_num_kids: 0,
    p_payment_option: "offline",
    p_status: "offline_blocked",
    p_influencer_id: null,
    p_firecamp: false
  });
  if (error) return notifyAdmin(error.message, true);
  await loadSales();
  updateBlockHint();
  notifyAdmin("Room blocked for the selected dates.");
}

adminBlockForm?.addEventListener("submit", async event => {
  event.preventDefault();
  await blockRoomFromAdmin(adminBlockRoom.value, adminBlockFrom.value, adminBlockTo.value, Number(adminBlockRooms.value));
});

[adminBlockRoom, adminBlockFrom, adminBlockTo, adminBlockRooms].forEach(input => {
  input?.addEventListener("input", () => {
    if (input === adminBlockFrom && adminBlockFrom.value) adminBlockTo.value = nextDate(adminBlockFrom.value);
    updateBlockHint();
  });
});

function editRoom(id) {
  const room = ownerRooms.find(item => item.id === id);
  if (!room) return;
  editingRoomId = id;
  adminRoomForm.classList.remove("hidden");
  addHotelBtn.classList.add("hidden");
  currentRoomImages = (room.image_urls || []).map((url, index) => ({ url, order: index + 1 }));
  renderImageOrderList();
  document.querySelector("#adminRoomName").value = room.room_name;
  document.querySelector("#adminRoomType").value = room.room_type;
  document.querySelector("#adminAvailableRooms").value = room.available_rooms;
  document.querySelector("#adminMaxAdults").value = room.max_adults;
  document.querySelector("#adminWeekdayPrice").value = room.weekday_price;
  adminWeekdayOwnerPrice.value = room.weekday_owner_price || 0;
  document.querySelector("#adminWeekendPrice").value = room.weekend_price;
  adminWeekendOwnerPrice.value = room.weekend_owner_price || 0;
  document.querySelector("#adminSpecialAttention").value = room.special_attention || "";
  if (adminRoomOwner) adminRoomOwner.value = room.owner_id || "";
  adminRoomForm.querySelectorAll(".amenity-checks input").forEach(input => {
    input.checked = (room.amenities || []).includes(input.value);
  });
  setSaving(false);
  setStatus("Editing room. Upload new images only if you want to replace existing images.");
  adminRoomForm.scrollIntoView({ behavior: "smooth", block: "start" });
}

async function uploadRoomImage(file) {
  validateImageFile(file);
  if (!supabaseClient) return fileToDataUrl(file);
  const safeName = file.name.replace(/[^a-z0-9.]/gi, "-");
  const path = `rooms/${Date.now()}-${safeName}`;
  const { error } = await supabaseClient.storage
    .from(supabaseConfig.roomBucket || "room-images")
    .upload(path, file, { upsert: true, cacheControl: "31536000" });
  if (error) throw error;
  const { data } = supabaseClient.storage
    .from(supabaseConfig.roomBucket || "room-images")
    .getPublicUrl(path);
  return data.publicUrl;
}

function renderImageOrderList() {
  const container = document.querySelector("#imageOrderContainer");
  const list = document.querySelector("#imageOrderList");
  if (!container || !list) return;
  
  if (currentRoomImages.length === 0) {
    container.classList.add("hidden");
    return;
  }
  
  container.classList.remove("hidden");
  list.innerHTML = currentRoomImages.map((img, index) => `
    <div style="display: flex; align-items: center; justify-content: space-between; padding: 6px; background: #252525; border-radius: 6px;">
      <div style="display: flex; align-items: center; gap: 10px;">
        <img src="${escapeHtml(safeUrl(img.url))}" style="width: 40px; height: 40px; object-fit: cover; border-radius: 4px;">
        <span style="font-size: 13px; color: #ccc; max-width: 180px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
          ${escapeHtml(img.file ? img.file.name : "Existing Image")}
        </span>
      </div>
      <div style="display: flex; align-items: center; gap: 8px;">
        <span style="font-size: 12px; color: #888;">Order:</span>
        <input type="number" class="image-order-input" data-index="${index}" min="1" value="${img.order || ""}" placeholder="${index + 1}" style="width: 60px; height: 30px; background: #2a2a2a; border: 1px solid var(--border); color: #fff; text-align: center; border-radius: 4px;">
        <button type="button" class="ghost-btn remove-img-btn" data-index="${index}" style="color: var(--danger); border-color: rgba(214,41,118,0.2); padding: 4px 8px; font-size: 11px;">Remove</button>
      </div>
    </div>
  `).join("");
  
  const updateOrderVal = (e) => {
    const idx = parseInt(e.target.dataset.index, 10);
    currentRoomImages[idx].order = e.target.value ? parseInt(e.target.value, 10) : null;
  };
  list.querySelectorAll(".image-order-input").forEach(input => {
    input.addEventListener("input", updateOrderVal);
    input.addEventListener("change", updateOrderVal);
    input.addEventListener("keyup", updateOrderVal);
  });
  
  list.querySelectorAll(".remove-img-btn").forEach(btn => {
    btn.addEventListener("click", (e) => {
      const idx = parseInt(e.currentTarget.dataset.index, 10);
      currentRoomImages.splice(idx, 1);
      renderImageOrderList();
    });
  });
}

document.querySelector("#adminImages")?.addEventListener("change", (e) => {
  const files = Array.from(e.target.files);
  const startOrder = editingRoomId ? currentRoomImages.length : 0;
  const newImages = files.map((file, index) => {
    const url = URL.createObjectURL(file);
    return { file, url, order: startOrder + index + 1 };
  });
  
  if (editingRoomId) {
    currentRoomImages = [...currentRoomImages, ...newImages];
  } else {
    currentRoomImages = newImages;
  }
  renderImageOrderList();
});

// Auth UI helper
function showAuthScreen(showLogin) {
  if (showLogin) {
    location.href = "login.html?type=admin";
  } else {
    if (adminDashboard) adminDashboard.classList.add("active");
    if (adminLogoutBtn) adminLogoutBtn.classList.remove("hidden");
  }
}

async function requireSuperAdmin() {
  const { data, error } = await supabaseClient.rpc("is_admin");
  if (error || data !== true) {
    await supabaseClient.auth.signOut();
    alert("Super admin access only.");
    showAuthScreen(true);
    return false;
  }
  return true;
}

// Handle logout click
if (adminLogoutBtn) {
  adminLogoutBtn.addEventListener("click", async () => {
    if (!supabaseClient) return;
    if (confirm("Are you sure you want to log out?")) {
      const { error } = await supabaseClient.auth.signOut();
      if (error) {
        notifyAdmin("Logout failed. Please try again.", true);
      }
    }
  });
}

function setupAdminTabs() {
  adminSectionSelect?.addEventListener("change", () => showAdminSection(adminSectionSelect.value));
  upcomingDaysFilter?.addEventListener("change", loadUpcomingBookings);
  adminPricingForm?.addEventListener("submit", savePricingSettings);
  adminPaymentForm?.addEventListener("submit", savePaymentSettings);
  showAdminSection("inventory");
}

function showAdminSection(section) {
  const sections = {
    inventory: { content: contentInventory },
    owners: { content: contentOwners },
    sales: { content: contentSales, load: loadSales },
    customers: { content: contentCustomers, load: loadCustomers },
    pricing: { content: contentPricing, load: loadPricingSettings },
    influencers: { content: contentInfluencers, load: loadInfluencers },
    highlights: { content: contentHighlights, load: loadHighlights },
    upcoming: { content: contentUpcoming, load: loadUpcomingBookings }
  };
  if (!sections[section]) section = "inventory";
  Object.values(sections).forEach(({ content }) => {
    content?.classList.add("hidden");
  });
  sections[section].content?.classList.remove("hidden");
  if (adminSectionSelect) adminSectionSelect.value = section;
  sections[section].load?.();
}

// Initialize Auth listeners on load
window.addEventListener("DOMContentLoaded", () => {
  setupAdminTabs();
  if (adminBlockFrom && !adminBlockFrom.value) {
    adminBlockFrom.value = new Date().toISOString().slice(0, 10);
    adminBlockTo.value = nextDate(adminBlockFrom.value);
  }
  if (supabaseClient) {
    setupRealtime();
    supabaseClient.auth.onAuthStateChange(async (event, session) => {
      if (session) {
        if (!(await requireSuperAdmin())) return;
        showAuthScreen(false);
        await loadOwners();
        await loadRooms();
        await loadSales();
      } else {
        showAuthScreen(true);
        ownerRooms = [];
        hotelOwners = [];
        allBookings = [];
        renderRooms();
        renderOwners();
      }
    });
  } else {
    showAuthScreen(false);
    setStatus("Backend not connected.");
    ownerRooms = [];
    hotelOwners = [];
    allBookings = [];
    renderRooms();
    renderOwners();
  }
});

function setupRealtime() {
  if (!supabaseClient) return;
  supabaseClient
    .channel("admin-realtime-sync")
    .on("postgres_changes", { event: "*", schema: "public", table: "bookings" }, () => {
      loadSales();
      if (!contentUpcoming?.classList.contains("hidden")) loadUpcomingBookings();
    })
    .on("postgres_changes", { event: "*", schema: "public", table: "rooms" }, () => {
      loadRooms();
    })
    .on("postgres_changes", { event: "*", schema: "public", table: "hotel_owners" }, () => {
      loadOwners();
    })
    .subscribe();
}

// Load registered owners
let editingOwnerId = null;

async function loadOwners() {
  if (!supabaseClient) return;
  let { data, error } = await supabaseClient
    .from("hotel_owners_with_auth")
    .select("*")
    .eq("active", true)
    .order("created_at", { ascending: false });
  if (error) {
    ({ data, error } = await supabaseClient
      .from("hotel_owners")
      .select("*")
      .eq("active", true)
      .order("created_at", { ascending: false }));
    if (error) {
      adminOwnerList.innerHTML = `<p class="muted-line">Could not load registered owners right now.</p>`;
      notifyAdmin("Could not load registered owners.", true);
      return;
    }
  }
  hotelOwners = data || [];
  renderOwners();
  populateOwnerDropdown();
}

function renderOwners() {
  if (!adminOwnerList) return;
  adminOwnerList.innerHTML = hotelOwners.length ? hotelOwners.map(owner => `
    <article class="admin-room-item" style="padding: 14px; border-left: 4px solid var(--accent); border-radius: 8px; margin-bottom: 12px; display: flex; justify-content: space-between; align-items: center;">
      <div style="flex-grow: 1;">
        <strong style="font-size: 16px; color: var(--text);">${escapeHtml(owner.hotel_name || "Hotel Owner")}</strong>
        <p style="font-size: 13px; color: var(--muted); margin: 4px 0 0;">
          <strong>Owner:</strong> ${escapeHtml(owner.owner_name)} &middot; 
          <strong>Phone:</strong> ${escapeHtml(owner.phone || "N/A")}
          ${owner.alt_phone ? `&middot; <strong>Alt:</strong> ${escapeHtml(owner.alt_phone)}` : ""}
        </p>
      </div>
      <div class="admin-actions">
        <button class="ghost-btn" data-edit-owner="${escapeHtml(owner.id)}" type="button" style="margin-right: 8px; border-color: rgba(255,255,255,0.15);">Edit</button>
        <button class="ghost-btn" data-delete-owner="${escapeHtml(owner.id)}" type="button" style="color: var(--danger); border-color: rgba(214,41,118,0.2);">Delete</button>
      </div>
    </article>
  `).join("") : "No owners registered yet.";
}

function populateOwnerDropdown() {
  if (!adminRoomOwner) return;
  const selected = adminRoomOwner.value;
  adminRoomOwner.innerHTML = `<option value="">Select hotel owner...</option>` +
    hotelOwners.map(o => `<option value="${escapeHtml(o.id)}">${escapeHtml(o.hotel_name || o.owner_name)} (${escapeHtml(o.owner_name)})</option>`).join("");
  adminRoomOwner.value = selected;
}

// Handle owner form submit (create Auth user OR update existing profile + auth credentials)
if (adminOwnerForm) {
  adminOwnerForm.addEventListener("submit", async event => {
    event.preventDefault();
    if (!supabaseClient) return;

    const hotelName = adminOwnerHotel.value.trim();
    const ownerName = adminOwnerName.value.trim();
    const ownerPhone = adminOwnerPhone.value.trim();
    const altPhone = adminOwnerAltPhone.value.trim();
    const email = adminOwnerEmail.value.trim();
    const password = adminOwnerPassword.value.trim();

    // Disable register button
    const submitBtn = adminOwnerForm.querySelector("button[type='submit']");
    const originalText = submitBtn.textContent;
    submitBtn.disabled = true;
    submitBtn.textContent = editingOwnerId ? "Updating..." : "Registering...";

    try {
      if (editingOwnerId) {
        // EDIT MODE: 1. Update Auth credentials (email, password) via RPC
        const { error: rpcError } = await supabaseClient.rpc("update_owner_auth", {
          user_id: editingOwnerId,
          new_email: email,
          new_password: password // Ignored if blank inside the SQL function
        });

        if (rpcError) {
          throw new Error("Failed to update owner credentials.");
        }

        // 2. Update profile in hotel_owners table
        const { error: updateError } = await supabaseClient
          .from("hotel_owners")
          .update({
            hotel_name: hotelName,
            owner_name: ownerName,
            phone: ownerPhone,
            alt_phone: altPhone
          })
          .eq("id", editingOwnerId);

        if (updateError) {
          throw new Error("Failed to update owner profile.");
        }

        alert(`Successfully updated owner credentials and profile for ${hotelName}!`);
        editingOwnerId = null;
      } else {
        // REGISTER MODE: Call RPC to register owner programmatically with confirmed email
        const { data: newUserId, error: rpcError } = await supabaseClient.rpc("admin_create_owner", {
          new_email: email,
          new_password: password,
          o_name: ownerName,
          o_phone: ownerPhone,
          a_phone: altPhone,
          h_name: hotelName,
          w_policy: adminOwnerWeekendPolicy.value
        });

        if (rpcError) {
          throw new Error("Owner registration failed.");
        }

        alert(`Successfully registered ${ownerName} for ${hotelName}!`);
      }

      // Reset form and UI fields
      adminOwnerForm.reset();
      adminOwnerPassword.required = true;
      if (submitBtn) {
        submitBtn.textContent = "Register Owner";
      }
      await loadOwners();
    } catch (err) {
      notifyAdmin(err.message, true);
    } finally {
      submitBtn.disabled = false;
      if (!editingOwnerId && submitBtn) {
        submitBtn.textContent = "Register Owner";
      }
    }
  });
}

// Handle owner list actions (Delete or Edit)
if (adminOwnerList) {
  adminOwnerList.addEventListener("click", async event => {
    const deleteBtn = event.target.closest("[data-delete-owner]");
    const editBtn = event.target.closest("[data-edit-owner]");
    if (!supabaseClient) return;

    if (deleteBtn) {
      if (!confirm("Remove this owner? (Note: Room associations will remain but owner login will be disabled)")) return;
      const { error } = await supabaseClient
        .from("hotel_owners")
        .update({ active: false })
        .eq("id", deleteBtn.dataset.deleteOwner);
      if (error) {
        notifyAdmin("Failed to delete owner.", true);
      } else {
        await loadOwners();
      }
    }

    if (editBtn) {
      const owner = hotelOwners.find(o => o.id === editBtn.dataset.editOwner);
      if (!owner) return;

      // Fill form values
      adminOwnerHotel.value = owner.hotel_name || "";
      adminOwnerName.value = owner.owner_name || "";
      adminOwnerPhone.value = owner.phone || "";
      adminOwnerAltPhone.value = owner.alt_phone || "";
      adminOwnerEmail.value = owner.email || "";
      adminOwnerPassword.value = ""; // Leave blank for admin to type new password

      // Password is not required when editing
      adminOwnerPassword.required = false;

      // Scroll smoothly to the edit form
      adminOwnerForm.scrollIntoView({ behavior: "smooth", block: "start" });

      editingOwnerId = owner.id;
      const submitBtn = adminOwnerForm.querySelector("button[type='submit']");
      if (submitBtn) {
        submitBtn.textContent = "Update Owner";
      }
    }
  });
}

async function loadSales() {
  if (!supabaseClient) return;
  const { data, error } = await supabaseClient
    .from("admin_bookings")
    .select("*")
    .neq("status", "cancelled")
    .order("created_at", { ascending: false });
  if (error) {
    console.error("Failed to load sales:", error.message);
    return;
  }
  allBookings = data || [];
  renderSales();
  renderAdminBlocks();
  updateBlockHint();
}

async function loadCustomers() {
  if (!supabaseClient) return;
  if (!allBookings.length) await loadSales();
  const { data, error } = await supabaseClient
    .from("customer_profiles")
    .select("*")
    .order("last_seen_at", { ascending: false });
  if (error) {
    adminCustomerList.innerHTML = `<p class="muted-line">Customer details are not available right now.</p>`;
    notifyAdmin("Customer details are not available right now.", true);
    return;
  }
  allCustomers = data || [];
  renderCustomers();
}

function renderCustomers() {
  if (!adminCustomerList) return;
  const bookingCustomers = allBookings
    .filter(b => b.customer_email || b.customer_phone)
    .reduce((map, b) => {
      const key = b.customer_email || b.customer_phone;
      const row = map.get(key) || { name: b.customer_name, email: b.customer_email, phone: b.customer_phone, bookings: 0, amount: 0, last: "" };
      row.bookings += 1;
      row.amount += Number(b.total_price || 0);
      row.last = !row.last || b.created_at > row.last ? b.created_at : row.last;
      map.set(key, row);
      return map;
    }, new Map());
  adminCustomerList.innerHTML = `
    <h4>Visitors</h4>
    ${adminTable(["Name", "Email", "Phone", "Last seen"], allCustomers.map(c => [
      c.name || "Guest",
      c.email || "No email",
      c.phone || "No phone",
      c.last_seen_at ? new Date(c.last_seen_at).toLocaleString("en-IN") : ""
    ]), "No logged-in visitors yet.")}
    <h4>Customers with bookings</h4>
    ${adminTable(["Name", "Email", "Phone", "Bookings", "Total paid", "Last booking"], [...bookingCustomers.values()].map(c => [
      c.name || "Guest",
      c.email || "No email",
      c.phone || "No phone",
      c.bookings,
      `Rs.${c.amount.toLocaleString("en-IN")}`,
      c.last ? new Date(c.last).toLocaleString("en-IN") : ""
    ]), "No booking customers yet.")}
  `;
}

function renderSales() {
  if (!adminSalesList) return;
  let revenue = 0;
  let payout = 0;
  let profit = 0;
  allBookings.forEach(b => {
    revenue += b.total_price || 0;
    payout += b.owner_amount || 0;
    profit += b.profit_amount || 0;
  });
  document.querySelector("#adminTotalRevenue").textContent = "Rs." + revenue.toLocaleString("en-IN");
  document.querySelector("#adminTotalPayout").textContent = "Rs." + payout.toLocaleString("en-IN");
  document.querySelector("#adminTotalProfit").textContent = "Rs." + profit.toLocaleString("en-IN");

  adminSalesList.innerHTML = allBookings.length ? allBookings.map(b => `
    <article class="sales-item">
      <div style="flex-grow: 1;">
        <strong style="font-size: 15px; color: var(--text);">${escapeHtml(b.room_name || "Room blockage/booking")}</strong>
        <p style="font-size: 13px; color: var(--muted); margin: 4px 0 0;">
          <strong>Guest:</strong> ${escapeHtml(b.customer_name)} (${escapeHtml(b.customer_phone)}) &middot; 
          <strong>Email:</strong> ${escapeHtml(b.customer_email || "N/A")} &middot;
          <strong>Dates:</strong> ${escapeHtml(b.check_in)} to ${escapeHtml(b.check_out)} &middot; 
          <strong>Rooms:</strong> ${escapeHtml(b.num_rooms)}
        </p>
        ${b.payment_screenshot_url ? `<p><a href="${escapeHtml(b.payment_screenshot_url)}" target="_blank" rel="noopener">View payment screenshot</a> &middot; ${escapeHtml(b.manual_payment_status || "submitted")}</p>` : ""}
      </div>
      <div style="text-align: right;">
        <strong style="font-size: 15px; color: var(--text);">Revenue: Rs.${b.total_price.toLocaleString("en-IN")}</strong>
        <p style="font-size: 12px; color: var(--muted); margin: 2px 0 0;">
          Payout: Rs.${(b.owner_amount || 0).toLocaleString("en-IN")} &middot; 
          <span style="color: var(--primary); font-weight: bold;">Profit: Rs.${(b.profit_amount || 0).toLocaleString("en-IN")}</span>
        </p>
        ${b.status === "pending_payment" ? `
          <button class="primary-btn" data-confirm-manual-payment="${escapeHtml(b.id)}" type="button">Confirm payment</button>
          <button class="ghost-btn" data-cancel-manual-payment="${escapeHtml(b.id)}" type="button">Cancel booking</button>
        ` : ""}
        ${b.status === "offline_blocked" ? `<button class="ghost-btn" data-release-block="${escapeHtml(b.id)}" type="button">Release block</button>` : ""}
      </div>
    </article>
  `).join("") : "No bookings recorded yet.";
}

async function releaseBlockedRoom(id) {
  if (!id || !supabaseClient || !confirm("Release this blocked room?")) return;
  const { error } = await supabaseClient.from("bookings").update({ status: "cancelled" }).eq("id", id);
  if (error) return notifyAdmin(error.message, true);
  await loadSales();
  await loadUpcomingBookings();
  updateBlockHint();
  notifyAdmin("Blocked room released.");
}

adminSalesList?.addEventListener("click", async event => {
  const confirmManual = event.target.closest("[data-confirm-manual-payment]");
  if (confirmManual && supabaseClient && confirm("Confirm this UPI payment and booking?")) {
    const { error } = await supabaseClient.rpc("set_manual_booking_payment_status", {
      p_booking_id: confirmManual.dataset.confirmManualPayment,
      p_confirm: true
    });
  if (error) return notifyAdmin(error.message, true);
  await loadSales();
  await loadUpcomingBookings();
  updateBlockHint();
  notifyAdmin("Payment confirmed. Booking is now confirmed.");
  return;
  }

  const cancelManual = event.target.closest("[data-cancel-manual-payment]");
  if (cancelManual && supabaseClient && confirm("Cancel this booking and release the room(s)?")) {
    const { error } = await supabaseClient.rpc("set_manual_booking_payment_status", {
      p_booking_id: cancelManual.dataset.cancelManualPayment,
      p_confirm: false
    });
    if (error) return notifyAdmin(error.message, true);
    await loadSales();
    await loadUpcomingBookings();
    updateBlockHint();
    notifyAdmin("Booking cancelled and room(s) released.");
    return;
  }

  const button = event.target.closest("[data-release-block]");
  if (button) await releaseBlockedRoom(button.dataset.releaseBlock);
});

adminBlockList?.addEventListener("click", event => {
  const button = event.target.closest("[data-release-block]");
  if (button) releaseBlockedRoom(button.dataset.releaseBlock);
});

async function loadUpcomingBookings() {
  if (!supabaseClient || !adminUpcomingList) return;
  const days = Number(upcomingDaysFilter?.value || 3);
  const today = new Date().toISOString().slice(0, 10);
  const through = addDays(new Date(), days);
  const { data, error } = await supabaseClient
    .from("admin_bookings")
    .select("*")
    .eq("status", "confirmed")
    .gte("check_in", today)
    .lte("check_in", through)
    .order("check_in", { ascending: true })
    .order("created_at", { ascending: true });
  if (error) {
    adminUpcomingList.innerHTML = `<p class="muted-line">Upcoming bookings are not available right now.</p>`;
    notifyAdmin("Upcoming bookings are not available right now.", true);
    return;
  }
  upcomingBookings = data || [];
  renderUpcomingBookings();
}

function renderUpcomingBookings() {
  if (!adminUpcomingList) return;
  const now = Date.now();
  adminUpcomingList.innerHTML = upcomingBookings.length ? upcomingBookings.map(booking => {
    const status = booking.booking_confirmation_status || "not_contacted";
    const checkInMs = new Date(`${booking.check_in}T11:00:00`).getTime();
    const urgent = checkInMs - now <= 24 * 60 * 60 * 1000 && ["not_contacted", "unreachable"].includes(status);
    const total = Number(booking.total_price || 0);
    const advance = String(booking.payment_option) === "100" ? total : Math.ceil(total * 0.2);
    const balance = Math.max(0, total - advance);
    return `
      <article class="sales-item upcoming-item ${urgent ? "urgent" : ""}">
        <div style="flex-grow:1;">
          <strong>${escapeHtml(booking.customer_name || "Guest")} &middot; ${escapeHtml(booking.customer_phone || "No phone")}</strong>
          <p><strong>Hotel:</strong> ${escapeHtml(booking.hotel_name || "Hotel")} &middot; ${escapeHtml(booking.room_name || "Room")}</p>
          <p><strong>Owner:</strong> ${escapeHtml(booking.owner_name || "Not assigned")} &middot; ${escapeHtml(booking.owner_phone || "No owner phone")}</p>
          <p><strong>Guests:</strong> ${escapeHtml(booking.num_adults)} adults / ${escapeHtml(booking.num_kids)} kids &middot; <strong>Rooms:</strong> ${escapeHtml(booking.num_rooms)}</p>
          <p><strong>Dates:</strong> ${escapeHtml(booking.check_in)} to ${escapeHtml(booking.check_out)} &middot; <strong>Booked:</strong> ${booking.created_at ? escapeHtml(new Date(booking.created_at).toLocaleString("en-IN")) : ""}</p>
          <p><strong>Total:</strong> Rs.${total.toLocaleString("en-IN")} &middot; <strong>Advance paid:</strong> Rs.${advance.toLocaleString("en-IN")} &middot; <strong>Balance:</strong> Rs.${balance.toLocaleString("en-IN")}</p>
          ${booking.owner_amount ? `<p><strong>Owner payout:</strong> Rs.${Number(booking.owner_amount || 0).toLocaleString("en-IN")}</p>` : ""}
          ${booking.last_contact_attempt_at ? `<p><strong>Last call:</strong> ${escapeHtml(new Date(booking.last_contact_attempt_at).toLocaleString("en-IN"))}</p>` : ""}
        </div>
        <div class="upcoming-actions">
          ${urgent ? '<span class="status-badge urgent-badge">Urgent</span>' : ""}
          <select data-confirmation-status="${escapeHtml(booking.id)}">
            <option value="not_contacted" ${status === "not_contacted" ? "selected" : ""}>Not yet contacted</option>
            <option value="confirmed_coming" ${status === "confirmed_coming" ? "selected" : ""}>Confirmed coming</option>
            <option value="confirmed_not_coming" ${status === "confirmed_not_coming" ? "selected" : ""}>Confirmed not coming</option>
            <option value="unreachable" ${status === "unreachable" ? "selected" : ""}>Unreachable / no answer</option>
          </select>
          <button class="ghost-btn" data-mark-contacted="${escapeHtml(booking.id)}" type="button">Mark as contacted</button>
        </div>
      </article>
    `;
  }).join("") : "No upcoming check-ins in this window.";
}
async function updateUpcomingBooking(bookingId, status) {
  const payload = {
    booking_confirmation_status: status,
    last_contact_attempt_at: new Date().toISOString()
  };
  if (status === "confirmed_not_coming") {
    if (!confirm("Release this room and forfeit advance to hotel owner?")) return;
    payload.status = "cancelled";
  }
  const { error } = await supabaseClient.from("bookings").update(payload).eq("id", bookingId);
  if (error) return notifyAdmin(error.message, true);
  await loadUpcomingBookings();
  await loadSales();
  updateBlockHint();
  notifyAdmin("Upcoming booking status updated.");
}

adminUpcomingList?.addEventListener("click", event => {
  const button = event.target.closest("[data-mark-contacted]");
  if (!button) return;
  const id = button.dataset.markContacted;
  const select = adminUpcomingList.querySelector(`[data-confirmation-status="${CSS.escape(id)}"]`);
  updateUpcomingBooking(id, select?.value || "not_contacted");
});

if ("serviceWorker" in navigator) {
  navigator.serviceWorker.getRegistrations?.().then(registrations => {
    registrations.forEach(registration => registration.unregister());
  }).catch(() => {});
}

let deferredPrompt;
const pwaInstallBtn = document.querySelector("#pwaInstallBtn");

window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferredPrompt = e;
  if (pwaInstallBtn) pwaInstallBtn.style.display = 'inline-flex';
});

if (pwaInstallBtn) {
  pwaInstallBtn.addEventListener('click', async () => {
    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
    if (isIOS) {
      alert("To install this app on iOS:\n1. Tap the Share button in Safari (at the bottom or top of the screen).\n2. Scroll down the menu and tap 'Add to Home Screen'.");
    } else if (deferredPrompt) {
      deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      console.log("Install prompt outcome:", outcome);
      deferredPrompt = null;
      pwaInstallBtn.style.display = 'none';
    } else {
      alert("To add this app to your Home Screen, use your browser's menu (e.g. tap 'Install App' or 'Add to home screen').");
    }
  });
}

if (window.navigator.standalone === false || !window.matchMedia('(display-mode: standalone)').matches) {
  const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
  if (isIOS && pwaInstallBtn) {
    pwaInstallBtn.style.display = 'inline-flex';
  }
}

// Influencer Collaboration Functions
async function loadInfluencers() {
  if (!supabaseClient) return;
  const { data: bookingsData } = await supabaseClient
    .from("admin_bookings")
    .select("*")
    .neq("status", "cancelled");
  allBookings = bookingsData || [];

  const { data, error } = await supabaseClient
    .from("influencers")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) {
    setStatus(error.message, true);
    return;
  }
  
  renderInfluencers(data);
}

function renderInfluencers(influencersList) {
  if (!adminInfluencerList) return;
  
  if (influencersList.length === 0) {
    adminInfluencerList.innerHTML = `<p style="padding: 12px; color: var(--muted); text-align: center;">No influencers registered yet.</p>`;
    return;
  }
  
  const siteUrl = window.location.origin;
  
  adminInfluencerList.innerHTML = influencersList.map(inf => {
    const bookings = allBookings.filter(b => b.influencer_id === inf.id);
    const bookingsCount = bookings.length;
    const revenue = bookings.reduce((sum, b) => sum + (b.total_price || 0), 0);
    const refLink = `${siteUrl}/?ref=${inf.code}`;
    
    return `
      <article class="influencer-item">
        <div style="flex-grow: 1;">
          <strong style="font-size: 16px; color: var(--text);">${escapeHtml(inf.name)}</strong>
          <p style="font-size: 13px; color: var(--muted); margin: 4px 0 0;">
            <strong>Code:</strong> <code style="background: #2a2a2a; padding: 2px 6px; border-radius: 4px; color: var(--accent); font-weight: bold;">${escapeHtml(inf.code)}</code> &middot; 
            <strong>Visits:</strong> ${escapeHtml(inf.visits)} &middot;
            <strong>Bookings:</strong> ${bookingsCount}
          </p>
          <p style="font-size: 12px; color: var(--muted); margin: 6px 0 0; display: flex; align-items: center; gap: 6px;">
            <strong>Link:</strong> <a href="${escapeHtml(safeUrl(refLink))}" target="_blank" style="color: var(--primary); text-decoration: underline;">${escapeHtml(refLink)}</a>
            <button class="ghost-btn copy-link-btn" data-link="${escapeHtml(refLink)}" type="button" style="padding: 2px 6px; font-size: 10px; border-color: rgba(255,255,255,0.15);">Copy</button>
          </p>
        </div>
        <div style="text-align: right;">
          <strong style="font-size: 16px; color: var(--text);">Revenue: Rs.${revenue.toLocaleString("en-IN")}</strong>
          <p style="margin: 4px 0 0;">
            <button class="ghost-btn delete-influencer-btn" data-id="${escapeHtml(inf.id)}" type="button" style="color: var(--danger); border-color: rgba(214,41,118,0.2); padding: 4px 8px; font-size: 11px;">Remove</button>
          </p>
        </div>
      </article>
    `;
  }).join("");
  
  // Attach Copy button listeners
  adminInfluencerList.querySelectorAll(".copy-link-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      navigator.clipboard.writeText(btn.dataset.link);
      btn.textContent = "Copied!";
      setTimeout(() => { btn.textContent = "Copy"; }, 1500);
    });
  });

  // Attach Delete button listeners
  adminInfluencerList.querySelectorAll(".delete-influencer-btn").forEach(btn => {
    btn.addEventListener("click", async () => {
      if (!confirm("Are you sure you want to remove this influencer?")) return;
      const { error } = await supabaseClient.from("influencers").delete().eq("id", btn.dataset.id);
      if (error) {
        notifyAdmin(error.message, true);
      } else {
        loadInfluencers();
        notifyAdmin("Influencer removed.");
      }
    });
  });
}

// Add influencer submit listener on load
window.addEventListener("DOMContentLoaded", () => {
  const influencerForm = document.querySelector("#adminInfluencerForm");
  if (influencerForm) {
    influencerForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      const name = document.querySelector("#adminInfluencerName").value.trim();
      const code = document.querySelector("#adminInfluencerCode").value.trim().toLowerCase();
      
      const { error } = await supabaseClient.from("influencers").insert({ name, code });
      if (error) {
        notifyAdmin(error.message, true);
      } else {
        influencerForm.reset();
        loadInfluencers();
        notifyAdmin("Influencer registered.");
      }
    });
  }
});

// Highlights Manager Logic
let allHighlights = [];

async function loadHighlights() {
  if (!supabaseClient) return;
  const { data, error } = await supabaseClient
    .from("highlights")
    .select("*")
    .order("created_at", { ascending: true });
  if (error) {
    setStatus(error.message, true);
    return;
  }
  allHighlights = data || [];
  renderHighlightsAdmin();
}

function renderHighlightsAdmin() {
  if (!adminHighlightsList) return;
  
  if (allHighlights.length === 0) {
    adminHighlightsList.innerHTML = `<p style="padding: 12px; color: var(--muted); text-align: center;">No highlights added yet.</p>`;
    return;
  }
  
  adminHighlightsList.innerHTML = allHighlights.map(h => `
    <article class="admin-room-item" style="padding: 12px; border-left: 4px solid var(--accent); border-radius: 8px; margin-bottom: 12px; display: grid; grid-template-columns: 72px 1fr auto; gap: 12px; align-items: center;">
      <img src="${escapeHtml(safeUrl(h.image_url))}" alt="${escapeHtml(h.title)}" style="width: 60px; height: 60px; border-radius: 50%; object-fit: cover; border: 2px solid var(--accent);">
      <div>
        <strong style="font-size: 15px; color: var(--text);">${escapeHtml(h.title)}</strong>
        <p style="font-size: 12px; color: var(--muted); margin: 4px 0 0; word-break: break-all;">
          <strong>Link:</strong> <a href="${escapeHtml(safeUrl(h.url))}" target="_blank" style="color: var(--primary); text-decoration: underline;">${escapeHtml(h.url)}</a>
        </p>
      </div>
      <div class="admin-actions">
        <button class="ghost-btn edit-highlight-btn" data-id="${escapeHtml(h.id)}" type="button">Edit</button>
        <button class="ghost-btn delete-highlight-btn" data-id="${escapeHtml(h.id)}" type="button" style="color: var(--danger); border-color: rgba(214,41,118,0.2);">Delete</button>
      </div>
    </article>
  `).join("");

  // Attach Edit button listeners
  adminHighlightsList.querySelectorAll(".edit-highlight-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      const h = allHighlights.find(item => item.id === btn.dataset.id);
      if (!h) return;
      
      document.querySelector("#adminHighlightId").value = h.id;
      document.querySelector("#adminHighlightTitle").value = h.title;
      document.querySelector("#adminHighlightUrl").value = h.url;
      
      // Show Preview
      document.querySelector("#highlightImagePreview").src = h.image_url;
      document.querySelector("#highlightImagePreviewContainer").classList.remove("hidden");
      
      document.querySelector("#highlightsFormTitle").textContent = "Edit Highlight";
      document.querySelector("#adminHighlightCancelBtn").classList.remove("hidden");
      
      document.querySelector("#contentHighlights").scrollIntoView({ behavior: "smooth", block: "start" });
    });
  });

  // Attach Delete button listeners
  adminHighlightsList.querySelectorAll(".delete-highlight-btn").forEach(btn => {
    btn.addEventListener("click", async () => {
      if (!confirm("Are you sure you want to delete this highlight?")) return;
      const { error } = await supabaseClient.from("highlights").delete().eq("id", btn.dataset.id);
      if (error) {
        notifyAdmin(error.message, true);
      } else {
        loadHighlights();
        notifyAdmin("Highlight deleted.");
      }
    });
  });
}

async function uploadHighlightImage(file) {
  validateImageFile(file);
  if (!supabaseClient) return "";
  const safeName = file.name.replace(/[^a-z0-9.]/gi, "-");
  const path = `highlights/${Date.now()}-${safeName}`;
  const { error } = await supabaseClient.storage
    .from(supabaseConfig.roomBucket || "room-images")
    .upload(path, file, { upsert: true, cacheControl: "31536000" });
  if (error) throw error;
  const { data } = supabaseClient.storage
    .from(supabaseConfig.roomBucket || "room-images")
    .getPublicUrl(path);
  return data.publicUrl;
}

function resetHighlightForm() {
  const form = document.querySelector("#adminHighlightForm");
  if (form) form.reset();
  document.querySelector("#adminHighlightId").value = "";
  document.querySelector("#highlightImagePreviewContainer").classList.add("hidden");
  document.querySelector("#highlightsFormTitle").textContent = "Add New Highlight / Reel";
  document.querySelector("#adminHighlightCancelBtn").classList.add("hidden");
}

window.addEventListener("DOMContentLoaded", () => {
  const highlightForm = document.querySelector("#adminHighlightForm");
  const cancelBtn = document.querySelector("#adminHighlightCancelBtn");
  
  if (highlightForm) {
    highlightForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      const id = document.querySelector("#adminHighlightId").value;
      const title = document.querySelector("#adminHighlightTitle").value.trim();
      const url = document.querySelector("#adminHighlightUrl").value.trim();
      const fileInput = document.querySelector("#adminHighlightImage");
      const file = fileInput.files[0];
      
      try {
        let imageUrl = "";
        
        if (file) {
          imageUrl = await uploadHighlightImage(file);
        } else if (id) {
          const existing = allHighlights.find(item => item.id === id);
          if (existing) imageUrl = existing.image_url;
        }
        
        if (!imageUrl) {
          alert("Please select a cover image.");
          return;
        }
        
        if (id) {
          const { error } = await supabaseClient
            .from("highlights")
            .update({ title, url, image_url: imageUrl })
            .eq("id", id);
          if (error) throw error;
        } else {
          const { error } = await supabaseClient
            .from("highlights")
            .insert({ title, url, image_url: imageUrl });
          if (error) throw error;
        }
        
        resetHighlightForm();
        loadHighlights();
        notifyAdmin(id ? "Highlight updated." : "Highlight saved.");
      } catch (err) {
        notifyAdmin("Error saving highlight: " + err.message, true);
      }
    });
  }
  
  if (cancelBtn) {
    cancelBtn.addEventListener("click", () => {
      resetHighlightForm();
    });
  }
});

