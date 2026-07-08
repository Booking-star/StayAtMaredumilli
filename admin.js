// Global error logging for debugging
window.addEventListener("error", (e) => {
  alert("JS Error: " + e.message + " at " + e.filename + ":" + e.lineno);
});
window.addEventListener("unhandledrejection", (e) => {
  alert("JS Promise Error: " + e.reason);
});

const adminRoomForm = document.querySelector("#adminRoomForm");
const adminRoomList = document.querySelector("#adminRoomList");
const adminStatus = document.querySelector("#adminStatus");
const saveButton = adminRoomForm.querySelector("button[type='submit']");
const supabaseConfig = window.STAY_SUPABASE || {};

const supabaseClient = supabaseConfig.url && supabaseConfig.anonKey && window.supabase
  ? window.supabase.createClient(supabaseConfig.url, supabaseConfig.anonKey)
  : null;

const adminDashboard = document.querySelector("#adminDashboard");
const adminLogoutBtn = document.querySelector("#adminLogoutBtn");

const adminRoomOwner = document.querySelector("#adminRoomOwner");
const adminOwnerForm = document.querySelector("#adminOwnerForm");
const adminOwnerList = document.querySelector("#adminOwnerList");

const adminTabInventory = document.querySelector("#adminTabInventory");
const adminTabOwners = document.querySelector("#adminTabOwners");
const adminTabSales = document.querySelector("#adminTabSales");
const contentInventory = document.querySelector("#contentInventory");
const contentOwners = document.querySelector("#contentOwners");
const contentSales = document.querySelector("#contentSales");

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

let ownerRooms = [];
let hotelOwners = [];
let allBookings = [];
let editingRoomId = null;

function setStatus(message) {
  adminStatus.textContent = message;
}

function setSaving(isSaving) {
  saveButton.disabled = isSaving;
  saveButton.textContent = isSaving ? "Saving..." : editingRoomId ? "Update Room" : "Save Room";
}

function showError(message) {
  setStatus(message);
  alert(message);
}

async function loadRooms() {
  if (!supabaseClient) {
    setStatus("Supabase not connected.");
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
    setStatus(error.message);
    return;
  }
  ownerRooms = data || [];
  setStatus("Supabase connected. Rooms and images save to backend.");
  renderRooms();
}

function renderRooms() {
  adminRoomList.innerHTML = ownerRooms.length ? ownerRooms.map(room => `
    <article class="admin-room-item">
      <img src="${room.image_urls?.[0] || ""}" alt="${room.room_name}">
      <div>
        <strong>${room.room_name}</strong>
        <p>${room.room_type} &middot; ${room.available_rooms} rooms &middot; max ${room.max_adults} adults</p>
        <p style="font-size: 12px; color: var(--muted); margin-top: 4px;">
          Weekday: Website Rs.${room.weekday_price} (Owner Payout: Rs.${room.weekday_owner_price || 0}) &middot; 
          Weekend: Website Rs.${room.weekend_price} (Owner Payout: Rs.${room.weekend_owner_price || 0})
        </p>
      </div>
      <div class="admin-actions">
        <button class="ghost-btn" data-edit="${room.id}" type="button">Edit</button>
        <button class="ghost-btn" data-delete="${room.id}" type="button">Delete</button>
      </div>
    </article>
  `).join("") : "No rooms added yet.";
  if (window.lucide) lucide.createIcons();
}

adminRoomForm.addEventListener("submit", async event => {
  event.preventDefault();
  if (!supabaseClient) return showError("Supabase not connected.");
  setSaving(true);
  setStatus("Saving room and uploading images...");
  const files = Array.from(document.querySelector("#adminImages").files);
  const editingRoom = ownerRooms.find(room => room.id === editingRoomId);
  let imageUrls = [];
  try {
    imageUrls = files.length ? await uploadImages(files) : editingRoom?.image_urls || [];
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
    owner_id: adminRoomOwner ? adminRoomOwner.value : null,
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
  adminRoomForm.reset();
  await loadRooms();
  setSaving(false);
  setStatus("Saved. Room is now available on the customer site.");
  adminRoomList.scrollIntoView({ behavior: "smooth", block: "start" });
});

adminRoomList.addEventListener("click", async event => {
  const editButton = event.target.closest("[data-edit]");
  if (editButton) return editRoom(editButton.dataset.edit);
  const button = event.target.closest("[data-delete]");
  if (!button || !supabaseClient) return;
  if (!confirm("Delete this room?")) return;
  const { error } = await supabaseClient.from("rooms").update({ active: false }).eq("id", button.dataset.delete);
  if (error) return setStatus(error.message);
  await loadRooms();
});

function editRoom(id) {
  const room = ownerRooms.find(item => item.id === id);
  if (!room) return;
  editingRoomId = id;
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

async function uploadImages(files) {
  const urls = [];
  for (const file of files) {
    const safeName = file.name.replace(/[^a-z0-9.]/gi, "-");
    const path = `rooms/${Date.now()}-${safeName}`;
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

// Auth UI helper
function showAuthScreen(showLogin) {
  if (showLogin) {
    location.href = "login.html?type=admin";
  } else {
    if (adminDashboard) adminDashboard.classList.add("active");
    if (adminLogoutBtn) adminLogoutBtn.classList.remove("hidden");
  }
}

// Handle logout click
if (adminLogoutBtn) {
  adminLogoutBtn.addEventListener("click", async () => {
    if (!supabaseClient) return;
    if (confirm("Are you sure you want to log out?")) {
      const { error } = await supabaseClient.auth.signOut();
      if (error) {
        alert("Logout failed: " + error.message);
      }
    }
  });
}

function setupAdminTabs() {
  if (!adminTabInventory || !adminTabOwners || !adminTabSales) return;

  adminTabInventory.addEventListener("click", () => {
    adminTabInventory.classList.add("active");
    adminTabOwners.classList.remove("active");
    adminTabSales.classList.remove("active");
    contentInventory.classList.remove("hidden");
    contentOwners.classList.add("hidden");
    contentSales.classList.add("hidden");
  });

  adminTabOwners.addEventListener("click", () => {
    adminTabOwners.classList.add("active");
    adminTabInventory.classList.remove("active");
    adminTabSales.classList.remove("active");
    contentOwners.classList.remove("hidden");
    contentInventory.classList.add("hidden");
    contentSales.classList.add("hidden");
  });

  adminTabSales.addEventListener("click", () => {
    adminTabSales.classList.add("active");
    adminTabInventory.classList.remove("active");
    adminTabOwners.classList.remove("active");
    contentSales.classList.remove("hidden");
    contentInventory.classList.add("hidden");
    contentOwners.classList.add("hidden");
    loadSales();
  });
}

// Initialize Auth listeners on load
window.addEventListener("DOMContentLoaded", () => {
  setupAdminTabs();
  if (supabaseClient) {
    setupRealtime();
    supabaseClient.auth.onAuthStateChange(async (event, session) => {
      if (session) {
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
    setStatus("Supabase not connected.");
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
  const { data, error } = await supabaseClient
    .from("hotel_owners_with_auth")
    .select("*")
    .eq("active", true)
    .order("created_at", { ascending: false });
  if (error) {
    console.error("Failed to load owners:", error.message);
    return;
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
        <strong style="font-size: 16px; color: var(--text);">${owner.hotel_name || "Hotel Owner"}</strong>
        <p style="font-size: 13px; color: var(--muted); margin: 4px 0 0;">
          <strong>Owner:</strong> ${owner.owner_name} &middot; 
          <strong>Phone:</strong> ${owner.phone || "N/A"}
          ${owner.alt_phone ? `&middot; <strong>Alt:</strong> ${owner.alt_phone}` : ""}
        </p>
      </div>
      <div class="admin-actions">
        <button class="ghost-btn" data-edit-owner="${owner.id}" type="button" style="margin-right: 8px; border-color: rgba(255,255,255,0.15);">Edit</button>
        <button class="ghost-btn" data-delete-owner="${owner.id}" type="button" style="color: var(--danger); border-color: rgba(214,41,118,0.2);">Delete</button>
      </div>
    </article>
  `).join("") : "No owners registered yet.";
}

function populateOwnerDropdown() {
  if (!adminRoomOwner) return;
  const selected = adminRoomOwner.value;
  adminRoomOwner.innerHTML = `<option value="">Select hotel owner...</option>` +
    hotelOwners.map(o => `<option value="${o.id}">${o.hotel_name || o.owner_name} (${o.owner_name})</option>`).join("");
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
          throw new Error("Failed to update credentials: " + rpcError.message);
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
          throw new Error("Failed to update profile: " + updateError.message);
        }

        alert(`Successfully updated owner credentials and profile for ${hotelName}!`);
        editingOwnerId = null;
      } else {
        // REGISTER MODE: Sign up user in Supabase Auth
        const { data: authData, error: authError } = await supabaseClient.auth.signUp({
          email,
          password,
          options: {
            data: {
              role: 'owner',
              full_name: ownerName,
              phone: ownerPhone,
              alt_phone: altPhone,
              hotel_name: hotelName
            }
          }
        });

        if (authError) {
          console.error("Auth signup failure:", authError);
          const errMsg = authError.message || authError.error_description || (typeof authError === 'object' ? JSON.stringify(authError) : String(authError));
          throw new Error("Auth Sign-up failed: " + errMsg);
        }

        const user = authData?.user;
        if (!user) {
          throw new Error("Auth Sign-up did not return user data.");
        }

        // Insert into hotel_owners table using user.id
        const { error: profileError } = await supabaseClient
          .from("hotel_owners")
          .insert({
            id: user.id,
            hotel_name: hotelName,
            owner_name: ownerName,
            phone: ownerPhone,
            alt_phone: altPhone,
            active: true
          });

        if (profileError) {
          throw new Error("Failed to save owner profile: " + profileError.message);
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
      alert(err.message);
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
        alert("Failed to delete owner: " + error.message);
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
    .from("bookings")
    .select("*, rooms(room_name)")
    .neq("status", "cancelled")
    .order("created_at", { ascending: false });
  if (error) {
    console.error("Failed to load sales:", error.message);
    return;
  }
  allBookings = data || [];
  renderSales();
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
    <article class="admin-room-item" style="padding: 14px; border-left: 4px solid var(--primary); border-radius: 8px; margin-bottom: 12px; display: flex; justify-content: space-between; align-items: center;">
      <div style="flex-grow: 1;">
        <strong style="font-size: 15px; color: var(--text);">${b.rooms?.room_name || "Room blockage/booking"}</strong>
        <p style="font-size: 13px; color: var(--muted); margin: 4px 0 0;">
          <strong>Guest:</strong> ${b.customer_name} (${b.customer_phone}) &middot; 
          <strong>Dates:</strong> ${b.check_in} to ${b.check_out} &middot; 
          <strong>Rooms:</strong> ${b.num_rooms}
        </p>
      </div>
      <div style="text-align: right;">
        <strong style="font-size: 15px; color: var(--text);">Revenue: Rs.${b.total_price.toLocaleString("en-IN")}</strong>
        <p style="font-size: 12px; color: var(--muted); margin: 2px 0 0;">
          Payout: Rs.${(b.owner_amount || 0).toLocaleString("en-IN")} &middot; 
          <span style="color: var(--primary); font-weight: bold;">Profit: Rs.${(b.profit_amount || 0).toLocaleString("en-IN")}</span>
        </p>
      </div>
    </article>
  `).join("") : "No bookings recorded yet.";
}
