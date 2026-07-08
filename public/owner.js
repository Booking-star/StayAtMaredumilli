// Global error logging for debugging
window.addEventListener("error", (e) => {
  alert("JS Error: " + e.message + " at " + e.filename + ":" + e.lineno);
});
window.addEventListener("unhandledrejection", (e) => {
  alert("JS Promise Error: " + e.reason);
});

const ownerLoginForm = document.querySelector("#ownerLoginForm");
const ownerDashboard = document.querySelector("#ownerDashboard");
const ownerLoginScreen = document.querySelector("#ownerLoginScreen");
const ownerLogoutBtn = document.querySelector("#ownerLogoutBtn");
const loginStatus = document.querySelector("#loginStatus");
const loginSubmitBtn = ownerLoginForm ? ownerLoginForm.querySelector(".login-submit-btn") : null;

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

const supabaseConfig = window.STAY_SUPABASE || {};
const supabaseClient = supabaseConfig.url && supabaseConfig.anonKey && window.supabase
  ? window.supabase.createClient(supabaseConfig.url, supabaseConfig.anonKey)
  : null;

let currentOwner = null;
let ownerRooms = [];
let allBookings = [];
let activeTab = "current"; // "current", "future", "past"

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
    if (ownerDashboard) ownerDashboard.classList.remove("active");
    if (ownerLoginScreen) ownerLoginScreen.classList.add("active");
    if (ownerLogoutBtn) ownerLogoutBtn.classList.add("hidden");
  } else {
    if (ownerLoginScreen) ownerLoginScreen.classList.remove("active");
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
    .from("rooms")
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
    .from("bookings")
    .select("*")
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
  const todayStr = new Date().toISOString().split("T")[0];
  const threeDaysLater = new Date();
  threeDaysLater.setDate(threeDaysLater.getDate() + 3);
  const threeDaysLaterStr = threeDaysLater.toISOString().split("T")[0];

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
        <span class="room-name">${room.room_name}</span>
        <span class="room-type">${room.room_type} (${room.available_rooms} Room${room.available_rooms > 1 ? 's' : ''})</span>
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

  const todayStr = new Date().toISOString().split("T")[0];
  const threeDaysLater = new Date();
  threeDaysLater.setDate(threeDaysLater.getDate() + 3);
  const threeDaysLaterStr = threeDaysLater.toISOString().split("T")[0];

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
      <div style="padding: 32px; text-align: center; color: var(--muted); border: 1px dashed var(--border); border-radius: 8px; background: #fff;">
        No bookings found for this category.
      </div>
    `;
    return;
  }

  bookingsCardsContainer.innerHTML = filtered.map(booking => {
    const room = ownerRooms.find(r => r.id === booking.room_id) || {};
    const isOffline = booking.status === "offline_blocked";
    
    // Calculate nights
    const diffTime = Math.abs(new Date(booking.check_out) - new Date(booking.check_in));
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    
    return `
      <div class="booking-card ${isOffline ? 'offline-booking' : ''}">
        <div class="booking-card-header">
          <span class="room-name">${room.room_name || "Unknown Room"} (${room.room_type || "-"})</span>
          <span class="date-range">${formatDate(booking.check_in)} - ${formatDate(booking.check_out)} (${diffDays} Night${diffDays > 1 ? 's' : ''})</span>
        </div>
        <div class="booking-card-body">
          <p><strong>Guest:</strong> ${booking.customer_name}</p>
          <p><strong>Phone:</strong> ${booking.customer_phone}</p>
          <p><strong>Rooms:</strong> ${booking.num_rooms} Room(s)</p>
          <p><strong>Status:</strong> ${isOffline ? 'Offline Blocked' : 'Customer Confirmed'}</p>
          ${isOffline ? '' : `<p><strong>Revenue:</strong> ${formatPrice(booking.total_price)}</p>`}
        </div>
        <div class="booking-card-actions">
          <button class="release-btn" data-cancel-id="${booking.id}">
            ${isOffline ? 'Release Room' : 'Cancel Booking'}
          </button>
        </div>
      </div>
    `;
  }).join("");

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
  const promptMsg = isOffline 
    ? "Are you sure you want to release this offline room blockage?" 
    : "Are you sure you want to cancel this guest booking?";

  if (!confirm(promptMsg)) return;

  const { error } = await supabaseClient
    .from("bookings")
    .update({ status: "cancelled" })
    .eq("id", bookingId);

  if (error) {
    alert("Operation failed: " + error.message);
  } else {
    alert(isOffline ? "Room blockage released!" : "Booking cancelled!");
    await refreshBookings();
  }
}

// Open modal and prefill values based on selection
function openQuickModal(roomId, dateStr, remaining) {
  if (!quickBookingModal) return;

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
      if (modalBookingGuest) modalBookingGuest.textContent = booking.customer_name;
      if (modalBookingPhone) modalBookingPhone.textContent = booking.customer_phone;
      if (modalBookingDates) modalBookingDates.textContent = `${formatDate(booking.check_in)} to ${formatDate(booking.check_out)}`;
      if (modalBookingRooms) modalBookingRooms.textContent = `${booking.num_rooms} Room(s)`;
      if (modalSubmitRelease) modalSubmitRelease.dataset.bookingId = booking.id;
    } else {
      if (modalBookingStatus) modalBookingStatus.textContent = "Fully Booked";
      if (modalBookingGuest) modalBookingGuest.textContent = "Unknown Guest";
      if (modalBookingPhone) modalBookingPhone.textContent = "-";
      if (modalBookingDates) modalBookingDates.textContent = dateStr;
      if (modalBookingRooms) modalBookingRooms.textContent = `${room.available_rooms} Room(s)`;
      if (modalSubmitRelease) modalSubmitRelease.dataset.bookingId = "";
    }
  } else {
    if (modalTitle) modalTitle.textContent = "Block Room Offline";
    if (modalBlockSection) modalBlockSection.classList.remove("hidden");
    if (modalReleaseSection) modalReleaseSection.classList.add("hidden");

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

      const roomId = modalRoomId.value;
      const checkInStr = modalDate.value;
      
      // Calculate Check-out Str based on nights count
      const checkInDate = new Date(checkInStr);
      checkInDate.setDate(checkInDate.getDate() + nightsCount);
      const year = checkInDate.getFullYear();
      const month = String(checkInDate.getMonth() + 1).padStart(2, '0');
      const day = String(checkInDate.getDate()).padStart(2, '0');
      const checkOutStr = `${year}-${month}-${day}`;

      const guestName = (modalGuestName.value || "").trim() || "Offline Walk-in";
      const guestPhone = (modalGuestPhone.value || "").trim() || "N/A";
      
      const payload = {
        room_id: roomId,
        customer_name: guestName,
        customer_phone: guestPhone,
        check_in: checkInStr,
        check_out: checkOutStr,
        num_rooms: roomsCount,
        status: "offline_blocked",
        total_price: 0
      };

      // Check double-booking issues for any of the dates
      const { data: overlapping, error: availError } = await supabaseClient
        .from("bookings")
        .select("*")
        .eq("room_id", roomId)
        .neq("status", "cancelled")
        .lt("check_in", checkOutStr)
        .gt("check_out", checkInStr);

      if (availError) {
        alert("Availability check error: " + availError.message);
        return;
      }

      // Check max rooms capacity
      const room = ownerRooms.find(r => r.id === roomId);
      if (!room) return;

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

      // Perform insert
      const { error: insertError } = await supabaseClient
        .from("bookings")
        .insert(payload);

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

  // Handle Login Submit
  if (ownerLoginForm) {
    ownerLoginForm.addEventListener("submit", async event => {
      event.preventDefault();
      if (!supabaseClient) {
        if (loginStatus) {
          loginStatus.textContent = "Supabase is not connected.";
          loginStatus.classList.remove("hidden");
        }
        return;
      }
      if (loginStatus) loginStatus.classList.add("hidden");
      if (loginSubmitBtn) {
        loginSubmitBtn.disabled = true;
        loginSubmitBtn.textContent = "Signing In...";
      }
      const email = document.querySelector("#loginEmail").value;
      const password = document.querySelector("#loginPassword").value;
      const { data, error } = await supabaseClient.auth.signInWithPassword({
        email,
        password
      });
      if (loginSubmitBtn) {
        loginSubmitBtn.disabled = false;
        loginSubmitBtn.textContent = "Sign In";
      }
      if (error) {
        if (loginStatus) {
          loginStatus.textContent = error.message;
          loginStatus.classList.remove("hidden");
        }
      } else {
        ownerLoginForm.reset();
      }
    });
  }

  // Handle Logout Click
  if (ownerLogoutBtn) {
    ownerLogoutBtn.addEventListener("click", async () => {
      if (!supabaseClient) return;
      if (confirm("Are you sure you want to log out?")) {
        const { error } = await supabaseClient.auth.signOut();
        if (error) {
          alert("Logout failed: " + error.message);
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
  
  if (supabaseClient) {
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
    if (ownerGreeting) ownerGreeting.textContent = "Supabase Offline mode";
    allBookings = [];
    renderCalendarGrid();
    renderBookings();
  }
});
