window.addEventListener("error", (e) => {
  console.error("JS Error:", e.message, e.filename, e.lineno);
});
window.addEventListener("unhandledrejection", (e) => {
  console.error("JS Promise Error:", e.reason);
});

const ownerDashboard = document.querySelector("#ownerDashboard");
const ownerLogoutBtn = document.querySelector("#ownerLogoutBtn");

const ownerGreeting = document.querySelector("#ownerGreeting");
const statPastSales = document.querySelector("#statPastSales");
const statCurrentBookings = document.querySelector("#statCurrentBookings");
const statFutureBookings = document.querySelector("#statFutureBookings");

const ownerCalendarGrid = document.querySelector("#ownerCalendarGrid");
const bookingsCardsContainer = document.querySelector("#bookingsCardsContainer");

// Modal Elements
const quickBookingModal = document.querySelector("#quickBookingModal");
const modalCloseBtn = document.querySelector("#modalCloseBtn");
const modalTitle = document.querySelector("#modalTitle");
const modalRoomId = document.querySelector("#modalRoomId");
const modalDate = document.querySelector("#modalDate");
const modalRoomName = document.querySelector("#modalRoomName");
const modalDateStr = document.querySelector("#modalDateStr");
const modalBlockSection = document.querySelector("#modalBlockSection");
const modalReleaseSection = document.querySelector("#modalReleaseSection");

// Modal Steppers
const btnDecNights = document.querySelector("#btnDecNights");
const btnIncNights = document.querySelector("#btnIncNights");
const valNights = document.querySelector("#valNights");
const btnDecRooms = document.querySelector("#btnDecRooms");
const btnIncRooms = document.querySelector("#btnIncRooms");
const valRooms = document.querySelector("#valRooms");

// Modal Input Fields & Buttons
const modalGuestName = document.querySelector("#modalGuestName");
const modalGuestPhone = document.querySelector("#modalGuestPhone");
const modalSubmitBlock = document.querySelector("#modalSubmitBlock");
const modalSubmitRelease = document.querySelector("#modalSubmitRelease");

// Modal Booking Details (Release Flow)
const modalBookingStatus = document.querySelector("#modalBookingStatus");
const modalBookingGuest = document.querySelector("#modalBookingGuest");
const modalBookingPhone = document.querySelector("#modalBookingPhone");
const modalBookingDates = document.querySelector("#modalBookingDates");
const modalBookingRooms = document.querySelector("#modalBookingRooms");

const tabCurrent = document.querySelector("#tabCurrent");
const tabFuture = document.querySelector("#tabFuture");
const tabPast = document.querySelector("#tabPast");

const btnCustomBlock = document.querySelector("#btnCustomBlock");
const modalStaticRoomRow = document.querySelector("#modalStaticRoomRow");
const modalStaticDateRow = document.querySelector("#modalStaticDateRow");
const modalRoomSelectRow = document.querySelector("#modalRoomSelectRow");
const modalRoomSelect = document.querySelector("#modalRoomSelect");
const modalDateSelectRow = document.querySelector("#modalDateSelectRow");
const modalCustomDate = document.querySelector("#modalCustomDate");
const customCalendarWrapper = document.querySelector("#customCalendarWrapper");

const supabaseConfig = window.STAY_SUPABASE || {};
const supabaseClient = supabaseConfig.url && supabaseConfig.anonKey && window.supabase
  ? window.supabase.createClient(supabaseConfig.url, supabaseConfig.anonKey, {
      auth: { storageKey: "stay-admin-auth" }
    })
  : null;

let currentOwner = null;
let ownerRooms = [];
let allBookings = [];
let activeTab = "current"; // "current", "future", "past"
let isCustomBlockMode = false;

// Stepper values
let nightsCount = 1;
let roomsCount = 1;
let maxRoomsToBlock = 1;

// Helper to format currency
function formatPrice(value) {
  return "Rs. " + Number(value).toLocaleString("en-IN");
}

// Helper to format date
function formatDate(dateStr) {
  if (!dateStr) return "";
  const d = new Date(dateStr);
  return d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

// Helper to format date with day name
function formatDateWithDay(dateStr) {
  if (!dateStr) return "";
  const d = new Date(dateStr);
  return d.toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
}

// Toggle sections based on login state
function showAuthScreen(showLogin) {
  if (showLogin) {
    location.href = "login.html?type=owner";
  } else {
    if (ownerDashboard) ownerDashboard.classList.add("active");
    if (ownerLogoutBtn) ownerLogoutBtn.classList.remove("hidden");
  }
}

// Load owner data
async function loadOwnerData(userId) {
  if (!supabaseClient) return;
  
  // 1. Fetch Owner Profile
  const { data: ownerProfile, error: profileError } = await supabaseClient
    .from("hotel_owners")
    .select("*")
    .eq("id", userId)
    .eq("active", true)
    .single();

  if (profileError || !ownerProfile) {
    alert("Access Denied: You are not registered as a hotel owner. Please contact the administrator.");
    await supabaseClient.auth.signOut();
    return;
  }

  currentOwner = ownerProfile;
  if (ownerGreeting) ownerGreeting.textContent = `Welcome back, ${currentOwner.owner_name}`;

  // 2. Fetch Rooms
  const { data: rooms, error: roomsError } = await supabaseClient
    .from("rooms_with_owner_policy")
    .select("*")
    .eq("owner_id", userId)
    .eq("active", true);

  if (roomsError) {
    console.error(roomsError.message);
    return;
  }
  ownerRooms = rooms || [];

  // 3. Fetch Bookings & Render
  await refreshBookings();
}

async function refreshBookings() {
  if (!supabaseClient || !currentOwner) return;

  const roomIds = ownerRooms.map(r => r.id);
  if (roomIds.length === 0) {
    allBookings = [];
    calculateStats();
    renderCalendarGrid();
    renderBookings();
    return;
  }

  // Fetch bookings for this owner's rooms
  const { data: bookings, error: bookingsError } = await supabaseClient
    .from("owner_bookings")
    .select("id,room_id,check_in,check_out,num_rooms,num_adults,num_kids,total_price,owner_amount,status,payment_option,created_at")
    .in("room_id", roomIds)
    .neq("status", "cancelled")
    .order("check_in", { ascending: true });

  if (bookingsError) {
    console.error(bookingsError.message);
    return;
  }

  allBookings = bookings || [];
  calculateStats();
  renderCalendarGrid();
  renderBookings();
}

function calculateStats() {
  const todayStr = getLocalDateString();
  const threeDaysLater = new Date();
  threeDaysLater.setDate(threeDaysLater.getDate() + 3);
  const threeDaysLaterStr = getLocalDateString(threeDaysLater);

  let pastSalesSum = 0;
  let currentCount = 0;
  let futureCount = 0;

  allBookings.forEach(booking => {
    // Past sales (completed bookings)
    if (booking.check_out < todayStr) {
      if (booking.status !== "offline_blocked") {
        pastSalesSum += booking.total_price;
      }
    }
    // Next 3 days bookings (currently active or starting in the next 3 days)
    else if (booking.check_in <= threeDaysLaterStr && booking.check_out >= todayStr) {
      currentCount++;
    }
    // Future bookings (starting after 3 days)
    else if (booking.check_in > threeDaysLaterStr) {
      futureCount++;
    }
  });

  if (statPastSales) statPastSales.textContent = formatPrice(pastSalesSum);
  if (statCurrentBookings) statCurrentBookings.textContent = currentCount;
  if (statFutureBookings) statFutureBookings.textContent = futureCount;
}

// Generate next 10 days in local time
function getNext10Days() {
  const dates = [];
  for (let i = 0; i < 10; i++) {
    const d = new Date();
    d.setDate(d.getDate() + i);
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    dates.push(`${year}-${month}-${day}`);
  }
  return dates;
}

// Render the visual Room Calendar Grid
function renderCalendarGrid() {
  if (!ownerCalendarGrid) return;
  if (ownerRooms.length === 0) {
    ownerCalendarGrid.innerHTML = `<div style="padding: 24px; text-align: center; color: var(--muted); grid-column: 1 / span 11;">No rooms assigned to your account.</div>`;
    return;
  }

  const dates = getNext10Days();

  // 1. Build Header HTML
  let headerHtml = `<div class="calendar-header-cell" style="font-weight: 700; color: var(--accent); display: flex; align-items: center; justify-content: center;">Rooms</div>`;
  dates.forEach(dateStr => {
    const d = new Date(dateStr);
    const dayName = d.toLocaleDateString("en-IN", { weekday: "short" });
    const dayNum = d.getDate();
    headerHtml += `
      <div class="calendar-header-cell">
        <span class="day-num">${dayNum}</span>
        <span class="day-name">${dayName}</span>
      </div>
    `;
  });

  // 2. Build rows HTML
  let rowsHtml = "";
  ownerRooms.forEach(room => {
    rowsHtml += `
      <div class="calendar-room-cell">
        <span class="room-name">${escapeHtml(room.room_name)}</span>
        <span class="room-type">${escapeHtml(room.room_type)} (${escapeHtml(room.available_rooms)} Room${room.available_rooms > 1 ? 's' : ''})</span>
      </div>
    `;

    dates.forEach(dateStr => {
      // Find overlapping bookings for this room on this date
      const overlapping = allBookings.filter(b => 
        b.room_id === room.id && 
        b.check_in <= dateStr && 
        b.check_out > dateStr
      );

      const bookedCount = overlapping.reduce((sum, b) => sum + b.num_rooms, 0);
      const remaining = Math.max(0, room.available_rooms - bookedCount);
      const isVacant = remaining > 0;

      rowsHtml += `
        <div class="calendar-day-cell ${isVacant ? 'vacant' : 'blocked'}" 
             data-room-id="${room.id}" 
             data-date="${dateStr}" 
             data-remaining="${remaining}">
          <span class="status-text">${isVacant ? 'Vacant' : 'Full'}</span>
          <span class="count-text">${isVacant ? remaining + ' Free' : 'Blocked'}</span>
        </div>
      `;
    });
  });

  ownerCalendarGrid.innerHTML = headerHtml + rowsHtml;

  // Add click listeners to cells
  const cells = ownerCalendarGrid.querySelectorAll(".calendar-day-cell");
  cells.forEach(cell => {
    cell.addEventListener("click", () => {
      const roomId = cell.dataset.roomId;
      const dateStr = cell.dataset.date;
      const remaining = parseInt(cell.dataset.remaining, 10);
      openQuickModal(roomId, dateStr, remaining);
    });
  });
}

// Render dynamic booking cards
function renderBookings() {
  if (!bookingsCardsContainer) return;

  const todayStr = getLocalDateString();
  const threeDaysLater = new Date();
  threeDaysLater.setDate(threeDaysLater.getDate() + 3);
  const threeDaysLaterStr = getLocalDateString(threeDaysLater);

  let filtered = [];

  if (activeTab === "current") {
    filtered = allBookings.filter(b => b.check_in <= threeDaysLaterStr && b.check_out >= todayStr);
  } else if (activeTab === "future") {
    filtered = allBookings.filter(b => b.check_in > threeDaysLaterStr);
  } else if (activeTab === "past") {
    filtered = allBookings.filter(b => b.check_out < todayStr);
  }

  if (filtered.length === 0) {
    bookingsCardsContainer.innerHTML = `
      ${activeTab === "past" ? `
        <div class="card" style="padding: 16px; background: rgba(255,255,255,0.03); border-radius: 8px; border: 1px solid var(--border); margin-bottom: 20px; display: flex; justify-content: space-between; align-items: center;">
          <div>
            <span style="font-size: 13px; color: var(--muted);">Total Completed Bookings</span>
            <h2 style="margin: 4px 0 0; color: var(--text);">0</h2>
          </div>
          <div>
            <span style="font-size: 13px; color: var(--muted);">Total Nights Sold</span>
            <h2 style="margin: 4px 0 0; color: var(--text);">0</h2>
          </div>
          <div>
            <span style="font-size: 13px; color: var(--muted);">Total Payout (Your Share)</span>
            <h2 style="margin: 4px 0 0; color: var(--accent);">Rs.0</h2>
          </div>
        </div>
      ` : ""}
      <div style="padding: 32px; text-align: center; color: var(--muted); border: 1px dashed var(--border); border-radius: 8px; background: #fff;">
        No bookings found for this category.
      </div>
    `;
    return;
  }

  let earningsHeaderHtml = "";
  if (activeTab === "past") {
    const totalEarnings = filtered.reduce((sum, b) => sum + (b.owner_amount || 0), 0);
    const totalNights = filtered.reduce((sum, b) => {
      const diffTime = Math.abs(new Date(b.check_out) - new Date(b.check_in));
      return sum + Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    }, 0);

    earningsHeaderHtml = `
      <div class="card" style="padding: 16px; background: rgba(255,255,255,0.03); border-radius: 8px; border: 1px solid var(--border); margin-bottom: 20px; display: flex; justify-content: space-between; align-items: center;">
        <div>
          <span style="font-size: 13px; color: var(--muted);">Total Completed Bookings</span>
          <h2 style="margin: 4px 0 0; color: var(--text);">${filtered.length}</h2>
        </div>
        <div>
          <span style="font-size: 13px; color: var(--muted);">Total Nights Sold</span>
          <h2 style="margin: 4px 0 0; color: var(--text);">${totalNights}</h2>
        </div>
        <div>
          <span style="font-size: 13px; color: var(--muted);">Total Payout (Your Share)</span>
          <h2 style="margin: 4px 0 0; color: var(--accent);">Rs.${totalEarnings.toLocaleString("en-IN")}</h2>
        </div>
      </div>
    `;
  }

  const cardsHtml = filtered.map(booking => {
    const room = ownerRooms.find(r => r.id === booking.room_id) || {};
    const isOffline = booking.status === "offline_blocked";
    
    // Calculate nights
    const diffTime = Math.abs(new Date(booking.check_out) - new Date(booking.check_in));
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    
    return `
      <div class="booking-card ${isOffline ? 'offline-booking' : ''}">
        <div class="booking-card-header">
          <span class="room-name">${escapeHtml(room.room_name || "Unknown Room")} (${escapeHtml(room.room_type || "-")})</span>
          <span class="date-range">${formatDate(booking.check_in)} - ${formatDate(booking.check_out)} (${diffDays} Night${diffDays > 1 ? 's' : ''})</span>
        </div>
        <div class="booking-card-body">
          <p><strong>Booking:</strong> ${isOffline ? 'Offline block' : 'Customer booking'}</p>
          <p><strong>Guests:</strong> ${escapeHtml(booking.num_adults || 0)} adult(s), ${escapeHtml(booking.num_kids || 0)} kid(s)</p>
          <p><strong>Rooms:</strong> ${escapeHtml(booking.num_rooms)} Room(s)</p>
          <p><strong>Status:</strong> ${isOffline ? 'Offline Blocked' : 'Customer Confirmed'}</p>
          <p><strong>Your Share (Payout):</strong> Rs.${(booking.owner_amount || 0).toLocaleString("en-IN")}</p>
          ${isOffline ? '' : `<p><strong>Total Revenue:</strong> ${formatPrice(booking.total_price)}</p>`}
        </div>
        ${isOffline ? `<div class="booking-card-actions">
          <button class="release-btn" data-cancel-id="${booking.id}">Release Room</button>
        </div>` : ""}
      </div>
    `;
  }).join("");

  bookingsCardsContainer.innerHTML = earningsHeaderHtml + cardsHtml;

  // Attach cancel listeners
  const cancelButtons = bookingsCardsContainer.querySelectorAll("[data-cancel-id]");
  cancelButtons.forEach(btn => {
    btn.addEventListener("click", async () => {
      const bookingId = btn.dataset.cancelId;
      await cancelOrReleaseBooking(bookingId);
    });
  });
}

// Cancel or release booking logic
async function cancelOrReleaseBooking(bookingId) {
  if (!supabaseClient) return;

  const booking = allBookings.find(b => b.id === bookingId);
  if (!booking) return;
  
  const isOffline = booking.status === "offline_blocked";
  if (!isOffline) {
    alert("Customer bookings cannot be released from the owner panel. Please contact Stay@Maredumilli support.");
    return;
  }
  const promptMsg = "Are you sure you want to release this offline room blockage?";

  if (!confirm(promptMsg)) return;

  const { error } = await supabaseClient
    .from("bookings")
    .update({ status: "cancelled" })
    .eq("id", bookingId);

  if (error) {
    alert("Operation failed. Please try again or contact support.");
  } else {
    alert("Room blockage released!");
    await refreshBookings();
  }
}

// Open modal and prefill values based on selection
function openQuickModal(roomId, dateStr, remaining) {
  if (!quickBookingModal) return;

  isCustomBlockMode = false;
  if (modalStaticRoomRow) modalStaticRoomRow.classList.remove("hidden");
  if (modalStaticDateRow) modalStaticDateRow.classList.remove("hidden");
  if (modalRoomSelectRow) modalRoomSelectRow.classList.add("hidden");
  if (modalDateSelectRow) modalDateSelectRow.classList.add("hidden");

  const room = ownerRooms.find(r => r.id === roomId);
  if (!room) return;

  if (modalRoomId) modalRoomId.value = roomId;
  if (modalDate) modalDate.value = dateStr;
      if (modalRoomName) modalRoomName.textContent = room.room_name + ` (${room.room_type})`;
  if (modalDateStr) modalDateStr.textContent = formatDateWithDay(dateStr);

  // Reset steppers
  nightsCount = 1;
  roomsCount = 1;
  maxRoomsToBlock = remaining;

  if (valNights) valNights.textContent = nightsCount;
  if (valRooms) valRooms.textContent = roomsCount;

  // Check if fully blocked/full (remaining === 0)
  if (remaining === 0) {
    if (modalTitle) modalTitle.textContent = "Release Blocked Room";
    if (modalBlockSection) modalBlockSection.classList.add("hidden");
    if (modalReleaseSection) modalReleaseSection.classList.remove("hidden");

    // Find the booking details for this block
    const booking = allBookings.find(b => 
      b.room_id === roomId && 
      b.check_in <= dateStr && 
      b.check_out > dateStr
    );

    if (booking) {
      const isOffline = booking.status === "offline_blocked";
      if (modalBookingStatus) {
        modalBookingStatus.textContent = isOffline ? "Offline Blocked" : "Confirmed Booking";
        modalBookingStatus.style.color = isOffline ? "var(--danger)" : "var(--accent)";
      }
      if (modalBookingGuest) modalBookingGuest.textContent = isOffline ? "Offline block" : "Customer booking";
      if (modalBookingPhone) modalBookingPhone.textContent = isOffline ? "Owner-created block" : "Hidden for customer privacy";
      if (modalBookingDates) modalBookingDates.textContent = `${formatDate(booking.check_in)} to ${formatDate(booking.check_out)}`;
      if (modalBookingRooms) modalBookingRooms.textContent = `${booking.num_rooms} Room(s)`;
      if (modalSubmitRelease) {
        modalSubmitRelease.dataset.bookingId = isOffline ? booking.id : "";
        modalSubmitRelease.classList.toggle("hidden", !isOffline);
      }
    } else {
      if (modalBookingStatus) modalBookingStatus.textContent = "Fully Booked";
      if (modalBookingGuest) modalBookingGuest.textContent = "Unknown Guest";
      if (modalBookingPhone) modalBookingPhone.textContent = "-";
      if (modalBookingDates) modalBookingDates.textContent = dateStr;
      if (modalBookingRooms) modalBookingRooms.textContent = `${room.available_rooms} Room(s)`;
      if (modalSubmitRelease) {
        modalSubmitRelease.dataset.bookingId = "";
        modalSubmitRelease.classList.add("hidden");
      }
    }
  } else {
    if (modalTitle) modalTitle.textContent = "Block Room Offline";
    if (modalBlockSection) modalBlockSection.classList.remove("hidden");
    if (modalReleaseSection) modalReleaseSection.classList.add("hidden");
    if (modalSubmitRelease) modalSubmitRelease.classList.remove("hidden");

    if (modalGuestName) modalGuestName.value = "";
    if (modalGuestPhone) modalGuestPhone.value = "";
  }

  // Show Modal
  quickBookingModal.classList.remove("hidden");
}

// Close Modal
function closeQuickModal() {
  if (quickBookingModal) quickBookingModal.classList.add("hidden");
}

// Setup stepper controls
function setupSteppers() {
  if (btnDecNights) {
    btnDecNights.addEventListener("click", () => {
      if (nightsCount > 1) {
        nightsCount--;
        if (valNights) valNights.textContent = nightsCount;
      }
    });
  }
  if (btnIncNights) {
    btnIncNights.addEventListener("click", () => {
      if (nightsCount < 30) {
        nightsCount++;
        if (valNights) valNights.textContent = nightsCount;
      }
    });
  }
  if (btnDecRooms) {
    btnDecRooms.addEventListener("click", () => {
      if (roomsCount > 1) {
        roomsCount--;
        if (valRooms) valRooms.textContent = roomsCount;
      }
    });
  }
  if (btnIncRooms) {
    btnIncRooms.addEventListener("click", () => {
      if (roomsCount < maxRoomsToBlock) {
        roomsCount++;
        if (valRooms) valRooms.textContent = roomsCount;
      }
    });
  }
}

// Tab navigation hooks
function setupTabs() {
  const tabs = [
    { btn: tabCurrent, val: "current" },
    { btn: tabFuture, val: "future" },
    { btn: tabPast, val: "past" }
  ];

  tabs.forEach(t => {
    if (t.btn) {
      t.btn.addEventListener("click", () => {
        tabs.forEach(x => x.btn && x.btn.classList.remove("active-tab"));
        t.btn.classList.add("active-tab");
        activeTab = t.val;
        renderBookings();
      });
    }
  });
}

// Form and Submission setups
function setupSubmissions() {
  // Modal Close
  if (modalCloseBtn) {
    modalCloseBtn.addEventListener("click", closeQuickModal);
  }
  if (quickBookingModal) {
    quickBookingModal.addEventListener("click", (e) => {
      if (e.target === quickBookingModal) closeQuickModal();
    });
  }

  // Submit Block Offline
  if (modalSubmitBlock) {
    modalSubmitBlock.addEventListener("click", async () => {
      if (!supabaseClient) return;

      const roomId = isCustomBlockMode ? modalRoomSelect.value : modalRoomId.value;
      const checkInStr = isCustomBlockMode ? modalCustomDate.value : modalDate.value;
      
      if (!roomId || !checkInStr) {
        alert("Please select a room and start date.");
        return;
      }
      
      // Calculate Check-out Str based on nights count
      const checkInDate = new Date(checkInStr);
      checkInDate.setDate(checkInDate.getDate() + nightsCount);
      const year = checkInDate.getFullYear();
      const month = String(checkInDate.getMonth() + 1).padStart(2, '0');
      const day = String(checkInDate.getDate()).padStart(2, '0');
      const checkOutStr = `${year}-${month}-${day}`;

      const guestName = (modalGuestName.value || "").trim() || "Offline Walk-in";
      const guestPhone = (modalGuestPhone.value || "").trim() || "N/A";
      
      const room = ownerRooms.find(r => r.id === roomId);
      if (!room) return;

      // Check double-booking issues for any of the dates
      const { data: overlapping, error: availError } = await supabaseClient
        .from("owner_bookings")
        .select("room_id,check_in,check_out,num_rooms,status")
        .eq("room_id", roomId)
        .neq("status", "cancelled")
        .lt("check_in", checkOutStr)
        .gt("check_out", checkInStr);

      if (availError) {
        alert("Availability check error: " + availError.message);
        return;
      }

      // Find max overlap count
      let maxBooked = 0;
      const start = new Date(checkInStr);
      const end = new Date(checkOutStr);
      const diffDays = Math.ceil(Math.abs(end - start) / (1000 * 60 * 60 * 24));
      for (let i = 0; i < diffDays; i++) {
        const d = new Date(checkInStr);
        d.setDate(d.getDate() + i);
        const year = d.getFullYear();
        const month = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        const dStr = `${year}-${month}-${day}`;
        const dayBookings = overlapping.filter(b => b.check_in <= dStr && b.check_out > dStr);
        const dayBookedCount = dayBookings.reduce((sum, b) => sum + b.num_rooms, 0);
        if (dayBookedCount > maxBooked) {
          maxBooked = dayBookedCount;
        }
      }

      const availableRooms = room.available_rooms - maxBooked;
      if (roomsCount > availableRooms) {
        alert(`Cannot block rooms. Only ${availableRooms} room(s) are remaining for this full range.`);
        return;
      }

      // Optimistic UI Update: Render blocked cells immediately
      const optimisticReverts = [];
      for (let i = 0; i < diffDays; i++) {
        const d = new Date(checkInStr);
        d.setDate(d.getDate() + i);
        const year = d.getFullYear();
        const month = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        const dStr = `${year}-${month}-${day}`;

        const cell = document.querySelector(`.calendar-day-cell[data-room-id="${roomId}"][data-date="${dStr}"]`);
        if (cell) {
          optimisticReverts.push({
            element: cell,
            className: cell.className,
            innerHTML: cell.innerHTML
          });
          cell.className = "calendar-day-cell blocked";
          cell.innerHTML = `
            <span class="status-text">Full</span>
            <span class="count-text">Blocked</span>
          `;
        }
      }

      // Close modal instantly for lightning fast user response
      closeQuickModal();

      const { error: insertError } = await supabaseClient.rpc("create_booking_safe", {
        p_room_id: roomId,
        p_customer_name: guestName,
        p_customer_phone: guestPhone,
        p_customer_email: null,
        p_check_in: checkInStr,
        p_check_out: checkOutStr,
        p_num_rooms: roomsCount,
        p_num_adults: 1,
        p_num_kids: 0,
        p_payment_option: "offline",
        p_status: "offline_blocked",
        p_influencer_id: null,
        p_firecamp: false
      });

      if (insertError) {
        // Revert cells to original state on failure
        optimisticReverts.forEach(state => {
          state.element.className = state.className;
          state.element.innerHTML = state.innerHTML;
        });
        alert("Failed to block room: " + insertError.message);
      } else {
        await refreshBookings();
      }
    });
  }

  // Submit Release Offline Block
  if (modalSubmitRelease) {
    modalSubmitRelease.addEventListener("click", async () => {
      const bookingId = modalSubmitRelease.dataset.bookingId;
      if (!bookingId) {
        alert("No booking linked to this blockage.");
        return;
      }
      closeQuickModal();
      await cancelOrReleaseBooking(bookingId);
    });
  }



  // Handle Logout Click
  if (ownerLogoutBtn) {
    ownerLogoutBtn.addEventListener("click", async () => {
      if (!supabaseClient) return;
      if (confirm("Are you sure you want to log out?")) {
        const { error } = await supabaseClient.auth.signOut();
        if (error) {
          alert("Logout failed. Please try again.");
        }
      }
    });
  }
}

// Initialize Auth listeners on load
window.addEventListener("DOMContentLoaded", () => {
  setupTabs();
  setupSteppers();
  setupSubmissions();
  setupCustomBlockerBtn();
  
  if (supabaseClient) {
    setupRealtime();
    supabaseClient.auth.onAuthStateChange(async (event, session) => {
      if (session) {
        showAuthScreen(false);
        await loadOwnerData(session.user.id);
      } else {
        showAuthScreen(true);
        currentOwner = null;
        ownerRooms = [];
        allBookings = [];
        renderCalendarGrid();
        renderBookings();
      }
    });
  } else {
    showAuthScreen(false);
    if (ownerGreeting) ownerGreeting.textContent = "Offline mode";
    allBookings = [];
    renderCalendarGrid();
    renderBookings();
  }
});

function setupCustomBlockerBtn() {
  if (btnCustomBlock) {
    btnCustomBlock.addEventListener("click", () => {
      isCustomBlockMode = true;
      
      // Toggle modal inputs
      if (modalStaticRoomRow) modalStaticRoomRow.classList.add("hidden");
      if (modalStaticDateRow) modalStaticDateRow.classList.add("hidden");
      if (modalRoomSelectRow) modalRoomSelectRow.classList.remove("hidden");
      if (modalDateSelectRow) modalDateSelectRow.classList.remove("hidden");
      
      // Populate Room Select Dropdown
      if (modalRoomSelect) {
        modalRoomSelect.innerHTML = ownerRooms.map(r => `
          <option value="${escapeHtml(r.id)}">${escapeHtml(r.room_name)} (${escapeHtml(r.room_type)})</option>
        `).join("");
      }
      
      // Default custom date to today
      if (modalCustomDate) {
        modalCustomDate.value = getLocalDateString();
      }
      
      // Render the custom 3-month calendar selection list
      renderCustom3MonthCalendar();
      
      // Reset steppers
      nightsCount = 1;
      roomsCount = 1;
      maxRoomsToBlock = 30; // Max rooms allowed to block at once
      
      if (valNights) valNights.textContent = nightsCount;
      if (valRooms) valRooms.textContent = roomsCount;
      if (modalGuestName) modalGuestName.value = "";
      if (modalGuestPhone) modalGuestPhone.value = "";
      if (modalTitle) modalTitle.textContent = "Block Room Offline (Custom Date)";
      if (modalBlockSection) modalBlockSection.classList.remove("hidden");
      if (modalReleaseSection) modalReleaseSection.classList.add("hidden");
      
      quickBookingModal.classList.remove("hidden");
    });
  }
}

// Generate next 3 months list of calendars
function renderCustom3MonthCalendar() {
  if (!customCalendarWrapper) return;
  
  const todayStr = getLocalDateString();
  
  const threeMonthsLater = new Date();
  threeMonthsLater.setMonth(threeMonthsLater.getMonth() + 3);
  const maxStr = getLocalDateString(threeMonthsLater);
  
  const selectedDateStr = modalCustomDate.value || todayStr;
  
  let html = "";
  const daysOfWeek = ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"];
  
  for (let m = 0; m < 3; m++) {
    const targetMonthDate = new Date();
    targetMonthDate.setDate(1); // Set to first day to avoid month overflow
    targetMonthDate.setMonth(targetMonthDate.getMonth() + m);
    
    const year = targetMonthDate.getFullYear();
    const month = targetMonthDate.getMonth();
    const monthName = targetMonthDate.toLocaleDateString("en-IN", { month: "long", year: "numeric" });
    
    // First day of this month
    const firstDay = new Date(year, month, 1);
    let startOffset = firstDay.getDay() - 1;
    if (startOffset < 0) startOffset = 6; // Sunday
    
    const totalDays = new Date(year, month + 1, 0).getDate();
    
    html += `
      <div class="custom-calendar-month">
        <div class="custom-calendar-month-title">${monthName}</div>
        <div class="custom-calendar-grid">
          ${daysOfWeek.map(h => `<div class="custom-calendar-day-header">${h}</div>`).join("")}
          ${Array(startOffset).fill("").map(() => `<div></div>`).join("")}
          ${Array(totalDays).fill(0).map((_, i) => {
            const dayNum = i + 1;
            const mStr = String(month + 1).padStart(2, '0');
            const dStr = String(dayNum).padStart(2, '0');
            const dayDateStr = `${year}-${mStr}-${dStr}`;
            
            const disabled = (dayDateStr < todayStr) || (dayDateStr > maxStr);
            const isSelected = dayDateStr === selectedDateStr;
            
            return `
              <button 
                type="button" 
                class="custom-calendar-day ${isSelected ? "selected" : ""}" 
                data-date="${dayDateStr}"
                ${disabled ? "disabled" : ""}
              >
                ${dayNum}
              </button>
            `;
          }).join("")}
        </div>
      </div>
    `;
  }
  
  customCalendarWrapper.innerHTML = html;
  
  // Attach click listeners to selectable day buttons
  customCalendarWrapper.querySelectorAll(".custom-calendar-day:not(:disabled)").forEach(btn => {
    btn.addEventListener("click", (e) => {
      const selectedDate = e.currentTarget.dataset.date;
      modalCustomDate.value = selectedDate;
      renderCustom3MonthCalendar(); // Re-render to update highlghts
    });
  });
}

function setupRealtime() {
  if (!supabaseClient) return;
  supabaseClient
    .channel("owner-realtime-sync")
    .on("postgres_changes", { event: "*", schema: "public", table: "bookings" }, () => {
      refreshBookings();
    })
    .on("postgres_changes", { event: "*", schema: "public", table: "rooms" }, () => {
      if (currentOwner) loadOwnerData(currentOwner.id);
    })
    .subscribe();
}

function calculatePricing(room, fromStr, toStr, numRooms = 1) {
  const from = new Date(fromStr);
  const to = new Date(toStr);
  const nights = Math.max(1, Math.ceil((to - from) / 86400000) || 1);
  
  let websiteTotal = 0;
  let ownerTotal = 0;
  
  const policy = room.weekend_policy || "mon_fri";
  
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
    
    const webPrice = isWeekend ? (room.weekend_price || room.weekday_price || 0) : (room.weekday_price || 0);
    const ownPrice = isWeekend ? (room.weekend_owner_price || room.weekday_owner_price || 0) : (room.weekday_owner_price || 0);
    
    websiteTotal += webPrice;
    ownerTotal += ownPrice;
  }
  
  return {
    nights,
    websiteTotal: websiteTotal * numRooms,
    ownerTotal: ownerTotal * numRooms,
    profit: (websiteTotal - ownerTotal) * numRooms
  };
}

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
