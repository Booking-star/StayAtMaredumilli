// book.js - Checkout Controller for Stay@Maredumilli

const supabaseConfig = window.STAY_SUPABASE || {};
const supabaseClient = supabaseConfig.url && supabaseConfig.anonKey && window.supabase
  ? window.supabase.createClient(supabaseConfig.url, supabaseConfig.anonKey, {
      auth: {
        storageKey: "stay-customer-auth",
        flowType: "pkce",
        detectSessionInUrl: true,
        persistSession: true,
        autoRefreshToken: true
      }
    })
  : null;

// DOM Elements
const authPrompt = document.getElementById("authPrompt");
const checkoutShell = document.getElementById("checkoutShell");
const loginBtn = document.getElementById("loginBtn");
const checkoutContainer = document.getElementById("checkoutContainer");
const checkoutTitle = document.getElementById("checkoutTitle");
const bookingForm = document.getElementById("bookingForm");
const bookingRoomSummary = document.getElementById("bookingRoomSummary");
const billSummary = document.getElementById("billSummary");
const submitBtn = document.getElementById("submitBtn");
const finalCapacityWarning = document.getElementById("finalCapacityWarning");

const bookingName = document.getElementById("bookingName");
const bookingPhone = document.getElementById("bookingPhone");
const bookingEmail = document.getElementById("bookingEmail");
const adultsInput = document.getElementById("adultsInput");
const childrenInput = document.getElementById("childrenInput");
const roomsInput = document.getElementById("roomsInput");
const fromInput = document.getElementById("fromInput");
const toInput = document.getElementById("toInput");
const paymentInput = document.getElementById("paymentInput");
const firecampInput = document.getElementById("firecampInput");
const firecampField = document.getElementById("firecampField");
const travelInterestInput = document.getElementById("travelInterestInput");
const policyConsentInput = document.getElementById("policyConsentInput");

const manualPaymentBox = document.getElementById("manualPaymentBox");
const manualUpiId = document.getElementById("manualUpiId");
const manualPhonePeLink = document.getElementById("manualPhonePeLink");
const manualUpiLink = document.getElementById("manualUpiLink");
const paymentScreenshotInput = document.getElementById("paymentScreenshotInput");

// State
let room = null;
let allBookings = [];
let profile = getStore("stayProfile", {});
let pricingSettings = { occupancy80Surcharge: 200, occupancy90Surcharge: 300 };
let paymentSettings = { mode: "razorpay", upiId: "" };
let selectedRoomId = null;
let paymentFilePickerOpen = false;
let checkoutListenersWired = false;
let checkoutRealtimeWired = false;
let checkoutRefreshTimer = null;

function validPhone(value) {
  return normalizePhone(value).length === 10;
}

function normalizePhone(value) {
  const digits = String(value || "").replace(/\D/g, "");
  return digits.length === 12 && digits.startsWith("91") ? digits.slice(2) : digits;
}

// Helper Functions
function hasFirecamp(roomObj) {
  if (!roomObj) return false;
  const list = Array.isArray(roomObj.amenities) ? roomObj.amenities : String(roomObj.amenities || "").split(",");
  return list.some(item => /firecamp/i.test(item));
}

function firecampPrice(roomsCount = 1) {
  return Number(roomsCount || 1) <= 2 ? 600 : 1000;
}

function minRoomsNeededForAdults(roomObj, adults = 1) {
  return window.minRoomsForAdults(Number(roomObj?.maxAdults || 1), adults);
}

function detailsForRoom(roomObj, details = null) {
  return normalizeTripDetails(details, roomObj?.maxAdults || 1);
}

function fitDetailsToAvailability(roomObj, details = null) {
  const fitted = detailsForRoom(roomObj, details);
  const remaining = getAvailableRoomsCount(roomObj, fitted);
  const maxRooms = Math.max(0, remaining);
  const maxAdults = maxRooms * Math.max(1, Number(roomObj.maxAdults || 1));
  const requestedAdults = Number(fitted.adults || 1);
  const adults = maxAdults ? Math.min(requestedAdults, maxAdults) : requestedAdults;
  const minRooms = minRoomsNeededForAdults(roomObj, requestedAdults);
  return {
    ...fitted,
    requestedAdults,
    adults,
    minRooms,
    rooms: maxRooms ? clampRoomsForAdults(roomObj.maxAdults || 1, requestedAdults, fitted.rooms, maxRooms) : 0,
    maxRooms,
    maxAdults,
    partialFit: requestedAdults > maxAdults
  };
}

function priceForDates(roomObj, details = null) {
  const today = new Date();
  const fromStr = details?.from || getLocalDateString(today);
  const toStr = details?.to || getLocalDateString(new Date(today.getTime() + 86400000));
  const numRooms = Number(details?.rooms || 1);
  
  const fromDate = new Date(fromStr);
  const toDate = new Date(toStr);
  const nights = Math.max(1, Math.ceil((toDate - fromDate) / 86400000) || 1);
  
  let websiteTotal = 0;
  let ownerTotal = 0;
  
  const policy = roomObj.weekendPolicy || "mon_fri";
  
  for (let i = 0; i < nights; i++) {
    const d = new Date(fromDate);
    d.setDate(d.getDate() + i);
    const dayOfWeek = d.getDay();
    
    let isWeekend = false;
    if (policy === "mon_thu") {
      isWeekend = [0, 5, 6].includes(dayOfWeek);
    } else {
      isWeekend = [0, 6].includes(dayOfWeek);
    }
    
    const webPrice = isWeekend ? (roomObj.weekendPrice || roomObj.price || 0) : (roomObj.weekdayPrice || roomObj.price || 0);
    const ownPrice = isWeekend ? (roomObj.weekendOwnerPrice || roomObj.weekdayOwnerPrice || 0) : (roomObj.weekdayOwnerPrice || 0);
    
    websiteTotal += webPrice + occupancySurcharge(roomObj, getLocalDateString(d));
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

function bookedRoomsOnDate(roomObj, dateStr) {
  return allBookings.reduce((total, booking) => {
    const isSameRoom = String(booking.room_id) === String(roomObj.id);
    const isBooked = booking.check_in <= dateStr && booking.check_out > dateStr;
    return isSameRoom && isBooked ? total + Number(booking.num_rooms || 1) : total;
  }, 0);
}

function occupancySurcharge(roomObj, dateStr) {
  const totalRooms = Number(roomObj.availableRooms || 0);
  if (!totalRooms) return 0;
  const occupancy = bookedRoomsOnDate(roomObj, dateStr) / totalRooms;
  if (occupancy >= 0.9) return pricingSettings.occupancy90Surcharge;
  if (occupancy >= 0.8) return pricingSettings.occupancy80Surcharge;
  return 0;
}

function getAvailableRoomsCount(roomObj, details = null) {
  const today = new Date();
  const fromStr = details?.from || getLocalDateString(today);
  const toStr = details?.to || getLocalDateString(new Date(today.getTime() + 86400000));
  
  const overlapping = allBookings.filter(b => {
    const isSameRoom = String(b.room_id) === String(roomObj.id);
    const overlaps = b.check_in < toStr && b.check_out > fromStr;
    return isSameRoom && overlaps;
  });
  
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
  
  return Math.max(0, Number(roomObj.availableRooms) - maxBooked);
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

// Supabase & Config Load
async function loadPricingSettings() {
  if (!supabaseClient) return;
  const { data, error } = await supabaseClient.rpc("get_dynamic_pricing");
  if (error) {
    console.warn("Using default pricing settings:", error.message);
    return;
  }
  pricingSettings = {
    occupancy80Surcharge: Math.max(0, Number(data?.occupancy80Surcharge ?? 200)),
    occupancy90Surcharge: Math.max(0, Number(data?.occupancy90Surcharge ?? 300))
  };
}

async function loadPaymentSettings() {
  let data = null;
  try {
    const response = await fetch("/api/payment-settings", { cache: "no-store" });
    if (response.ok) data = await response.json();
  } catch (_) {}
  if (!data && supabaseClient) {
    const result = await supabaseClient.rpc("get_payment_settings");
    if (!result.error) data = result.data;
  }
  if (!data) return;
  paymentSettings = ["manual", "mock", "razorpay"].includes(data?.mode)
    ? { mode: data.mode, upiId: data.upiId || "Kandregulaashok1@ybl" }
    : { mode: "razorpay", upiId: "" };
}

async function loadAllBookings() {
  if (!supabaseClient) return;
  const todayStr = getLocalDateString();
  const { data, error } = await supabaseClient
    .from("booking_occupancy")
    .select("*")
    .gte("check_out", todayStr);
  if (error) {
    console.error("Booking occupancy loading failed:", error);
    return;
  }
  allBookings = data || [];
}

async function loadRoomDetails(id) {
  if (!supabaseClient) return null;
  const { data, error } = await supabaseClient
    .from("rooms_public")
    .select("*")
    .eq("id", id)
    .single();
  if (error) {
    console.error("Room loading failed:", error);
    return null;
  }
  return roomFromSupabase(data);
}

function scheduleCheckoutAvailabilityRefresh() {
  clearTimeout(checkoutRefreshTimer);
  checkoutRefreshTimer = setTimeout(async () => {
    await loadAllBookings();
    const latestRoom = await loadRoomDetails(selectedRoomId);
    if (latestRoom) room = latestRoom;
    updatePricingUI();
  }, 250);
}

function setupCheckoutRealtime() {
  if (!supabaseClient || checkoutRealtimeWired) return;
  checkoutRealtimeWired = true;
  supabaseClient
    .channel(`checkout-realtime-sync-${selectedRoomId}`)
    .on("postgres_changes", { event: "*", schema: "public", table: "bookings" }, scheduleCheckoutAvailabilityRefresh)
    .on("postgres_changes", { event: "*", schema: "public", table: "booking_holds" }, scheduleCheckoutAvailabilityRefresh)
    .on("postgres_changes", { event: "*", schema: "public", table: "rooms" }, scheduleCheckoutAvailabilityRefresh)
    .subscribe();
}

// Payment Methods moved to payment-service.js

async function saveCustomerProfile() {
  if (!supabaseClient) return { error: null };
  return supabaseClient.rpc("upsert_customer_profile", {
    p_name: profile.name || "",
    p_email: profile.email || "",
    p_phone: profile.phone || ""
  });
}

// UI Rendering
function checkoutDetailsFromForm() {
  return normalizeTripDetails({
    adults: Number(adultsInput.value || 1),
    children: Number(childrenInput.value || 0),
    rooms: Number(roomsInput.value || 1),
    from: fromInput.value,
    to: toInput.value,
    payment: paymentInput.value,
    travelInterest: travelInterestInput.checked,
    firecamp: firecampInput.checked
  }, room?.maxAdults || 1);
}

function updatePricingUI() {
  if (!room) return;
  if (checkoutTitle) checkoutTitle.textContent = `${room.name} - ${room.type}`;
  
  const formDetails = checkoutDetailsFromForm();
  const fitted = fitDetailsToAvailability(room, formDetails);
  
  roomsInput.min = fitted.maxRooms ? Math.min(fitted.minRooms, fitted.maxRooms) : 1;
  roomsInput.max = fitted.maxRooms || "";
  if (document.activeElement !== roomsInput) roomsInput.value = fitted.rooms || 1;
  submitBtn.disabled = !fitted.maxRooms;
  
  const pricing = priceForDates(room, fitted);
  const capacityWarningText = fitted.partialFit
    ? `Booking ${fitted.maxAdults} adult(s) here. Please book the remaining ${fitted.requestedAdults - fitted.maxAdults} adult(s) in another hotel.`
    : "";
  if (finalCapacityWarning) {
    finalCapacityWarning.textContent = capacityWarningText;
    finalCapacityWarning.classList.toggle("hidden", !capacityWarningText);
  }
  const selectedRoomsCount = Number(fitted.rooms || 1);
  const roomTotal = pricing.total;
  const firecampAmount = firecampPrice(selectedRoomsCount);
  const firecampTotal = firecampInput.checked && hasFirecamp(room) ? firecampAmount : 0;
  const total = roomTotal + firecampTotal;
  const paymentPercent = Number(paymentInput.value || 20);
  const payNow = Math.round(total * paymentPercent / 100);
  const option20 = paymentInput.querySelector('option[value="20"]');
  const option100 = paymentInput.querySelector('option[value="100"]');
  if (option20) option20.textContent = `Pay 20% advance - Rs.${Math.round(total * 0.2).toLocaleString("en-IN")}`;
  if (option100) option100.textContent = `Pay 100% now - Rs.${total.toLocaleString("en-IN")}`;
  
  const manualMode = paymentSettings.mode !== "razorpay" && paymentSettings.mode !== "mock";
  manualPaymentBox?.classList.toggle("hidden", !manualMode);
  if (manualUpiId) manualUpiId.textContent = paymentSettings.upiId || "UPI ID not set";
  if (paymentScreenshotInput) paymentScreenshotInput.required = manualMode;
  if (manualMode) setManualPaymentLinks(payNow, room);
  
  firecampField.classList.toggle("hidden", !hasFirecamp(room));
  const firecampLabel = firecampField.querySelector("span");
  if (firecampLabel) {
    firecampLabel.textContent = `Add firecamp for Rs.${firecampAmount.toLocaleString("en-IN")}`;
  }
  
  bookingRoomSummary.innerHTML = `
    <img src="${escapeHtml(safeUrl(room.images[0]))}" loading="lazy" decoding="async" alt="${escapeHtml(room.name)}">
    <div>
      <strong style="font-size: 18px; color: var(--text);">${escapeHtml(room.name)}</strong>
      <p style="margin: 4px 0 0; color: var(--muted); font-size: 14px;">${escapeHtml(room.type)} &middot; Rs.${pricing.perDay.toLocaleString("en-IN")} per room/day</p>
      <span style="font-size: 12px; color: var(--muted); display: block; margin-top: 4px;">Check-in 11:00 AM &middot; Check-out 10:00 AM next day</span>
    </div>
  `;
  
  billSummary.innerHTML = `
    <strong style="font-size: 16px; display: block; margin-bottom: 8px;">Bill Summary</strong>
    <p style="margin: 4px 0;">${pricing.nights} night(s) x ${selectedRoomsCount} room(s): Rs.${roomTotal.toLocaleString("en-IN")}</p>
    ${firecampTotal ? `<p style="margin: 4px 0;">Firecamp add-on: Rs.${firecampTotal.toLocaleString("en-IN")}</p>` : ""}
    <p style="margin: 4px 0; color: var(--muted); font-size: 13px;">Adults: ${fitted.adults || 1} &middot; Kids: ${fitted.children || 0}</p>
    ${capacityWarningText ? `<p class="capacity-warning">${capacityWarningText}</p>` : ""}
    <div style="border-top: 1px solid var(--border); margin-top: 10px; padding-top: 10px; display: grid; gap: 4px;">
      <b style="font-size: 16px;">Total: Rs.${total.toLocaleString("en-IN")}</b>
      <b style="font-size: 18px; color: var(--accent);">Pay now (${paymentPercent}%): Rs.${payNow.toLocaleString("en-IN")}</b>
    </div>
    ${manualMode ? `<p style="margin-top: 8px; font-size: 12px; color: var(--muted);">After payment, upload the screenshot below. Our team confirms manually within 10 minutes.</p>` : ""}
  `;
}

function showSuccess(refId, manualMode) {
  const message = manualMode
    ? `Payment submitted. Reference ID: ${refId}. Your room is held now. Our team will verify payment and confirm or cancel the booking within 5-10 minutes.`
    : `Booking confirmed. Reference ID: ${refId}. Welcome to Stay@Maredumilli!`;
    
  checkoutContainer.innerHTML = `
    <div class="panel text-center success-card" style="max-width: 500px; margin: 40px auto; padding: 40px 24px; border-radius: 12px; position: relative; overflow: hidden;">
      <div class="confetti"></div>
      <i data-lucide="check-circle" style="width: 64px; height: 64px; color: var(--accent); margin: 0 auto 16px;"></i>
      <h3 style="font-size: 26px; font-weight: 800; margin-bottom: 12px;">Booking Successful!</h3>
      <p style="color: var(--muted); line-height: 1.5; margin-bottom: 24px;">${message}</p>
      <div style="display: flex; flex-direction: column; gap: 10px;">
        <a class="primary-btn" href="/#bookings" style="text-align: center; text-decoration: none; padding: 12px; display: block;">View Your Bookings</a>
        <a class="ghost-btn" href="/" style="text-align: center; text-decoration: none; padding: 12px; display: block;">Go back Home</a>
      </div>
    </div>
  `;
  if (window.lucide) lucide.createIcons();
}

async function handleCheckoutFormSubmit(event) {
  event.preventDefault();
  
  if (policyConsentInput && !policyConsentInput.checked) {
    alert("Please accept the Terms of Service and Cancellation Policy before payment.");
    return;
  }
  
  const guestName = bookingName.value.trim();
  const guestPhone = normalizePhone(bookingPhone.value);
  let guestEmail = bookingEmail.value.trim();
  if (!guestEmail && supabaseClient) {
    const sessionData = await supabaseClient.auth.getSession().catch(() => null);
    guestEmail = sessionData?.data?.session?.user?.email || profile?.email || "";
    if (guestEmail) {
      bookingEmail.value = guestEmail;
    }
  }

  const manualMode = paymentSettings.mode !== "razorpay" && paymentSettings.mode !== "mock";
  const screenshotFile = paymentScreenshotInput?.files?.[0] || null;
  
  if (!guestName) {
    alert("Please enter your full name.");
    bookingName.focus();
    return;
  }
  if (!validPhone(guestPhone)) {
    alert("Please enter a valid 10 digit mobile number.");
    bookingPhone.focus();
    return;
  }
  if (!guestEmail) {
    alert("Please login again so we can attach the booking to your email.");
    return;
  }
  
  if (manualMode && !paymentSettings.upiId?.trim()) {
    alert("UPI payment is not configured yet. Please contact support.");
    return;
  }
  if (manualMode && !screenshotFile) {
    alert("Please pay by UPI and upload the payment screenshot before confirming.");
    return;
  }
  
  const formDetails = checkoutDetailsFromForm();
  const tripError = validateTripValues(formDetails);
  if (tripError) {
    alert(tripError);
    return;
  }
  const fitted = fitDetailsToAvailability(room, formDetails);
  const pricing = priceForDates(room, fitted);
  
  // Save user choices locally
  const savedDetailsObj = {
    name: guestName,
    phone: guestPhone,
    email: guestEmail,
    ...fitted
  };
  localStorage.setItem("stayBookingDetails", JSON.stringify(savedDetailsObj));
  profile = { ...profile, name: guestName, phone: guestPhone, email: guestEmail };
  localStorage.setItem("stayProfile", JSON.stringify(profile));
  saveCustomerProfile().catch(() => {});
  
  submitBtn.disabled = true;
  submitBtn.textContent = paymentSettings.mode === "razorpay" ? "Opening payment..." : "Submitting...";
  
  try {
    let bookingId;
    if (paymentSettings.mode === "razorpay") {
      const influencerId = localStorage.getItem("influencer_id");
      const { data: sessionData } = await supabaseClient.auth.getSession();
      const holdResponse = await fetch("/api/create-payment-hold", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${sessionData.session?.access_token || ""}`
        },
        body: JSON.stringify({
          p_room_id: room.id,
          p_customer_name: guestName,
          p_customer_phone: guestPhone,
          p_customer_email: guestEmail,
          p_check_in: fitted.from,
          p_check_out: fitted.to,
          p_num_rooms: fitted.rooms,
          p_num_adults: fitted.adults,
          p_num_kids: fitted.children,
          p_payment_option: fitted.payment,
          p_influencer_id: influencerId || null,
          p_firecamp: fitted.firecamp
        })
      });
      const hold = await holdResponse.json().catch(() => ({}));
      if (!holdResponse.ok) throw new Error(hold.error || "Could not hold rooms for payment.");
      const paymentResult = await startRazorpayPayment(hold, savedDetailsObj, room, pricing);
      bookingId = paymentResult.booking_id;
    } else {
      submitBtn.textContent = "Confirming booking...";
      bookingId = await createMockBooking(room, savedDetailsObj, pricing, manualMode ? "pending_payment" : "confirmed");
      if (manualMode) await attachManualScreenshotLater(bookingId, screenshotFile);
    }
    
    // Save booking to past bookings list locally
    let bookings = [];
    try {
      bookings = JSON.parse(localStorage.getItem("stayBookings")) || [];
    } catch (_) {}
    
    const newBooking = {
      ...savedDetailsObj,
      id: bookingId || Date.now(),
      reference: bookingReference(bookingId),
      roomName: room.name,
      roomImage: room.images[0],
      price: pricing.perDay,
      status: manualMode ? "Payment submitted" : "Confirmed"
    };
    
    localStorage.setItem("stayBookings", JSON.stringify([newBooking, ...bookings]));
    if (savedDetailsObj.travelInterest) await saveTravelInterestLead(room, savedDetailsObj).catch(() => false);
    
    showSuccess(bookingReference(bookingId), manualMode);
  } catch (error) {
    alert(friendlyBookingError(error.message));
    submitBtn.disabled = false;
    submitBtn.textContent = "Pay & Confirm";
  }
}

async function signInWithGoogle() {
  if (!supabaseClient) {
    alert("Google login is still loading. Please refresh and try again.");
    return;
  }
  loginBtn.disabled = true;
  localStorage.removeItem("stayCustomerSignedOut");
  localStorage.setItem("stayLoginStartedAt", String(Date.now()));
  const { error } = await supabaseClient.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo: window.location.href
    }
  });
  if (error) {
    loginBtn.disabled = false;
    alert("Google login could not start. Please refresh and try again.");
  }
}

function setLandingVideo() {
  const video = authPrompt?.querySelector(".landing-video");
  if (!video) return;
  const src = window.innerWidth >= window.innerHeight ? "/landing.mp4" : "/landing-vertical.mp4";
  if (!video.src.endsWith(src)) {
    video.classList.remove("ready");
    video.src = src;
    video.load();
    video.play().catch(() => {});
  }
}

// Init
window.addEventListener("DOMContentLoaded", async () => {
  const video = authPrompt?.querySelector(".landing-video");
  if (video) {
    video.addEventListener("loadeddata", () => video.classList.add("ready"));
    video.addEventListener("error", () => video.classList.add("hidden"));
  }

  window.addEventListener("resize", () => {
    if (authPrompt && !authPrompt.classList.contains("hidden")) {
      setLandingVideo();
    }
  });

  if (window.lucide) lucide.createIcons();
  
  const params = new URLSearchParams(location.search);
  selectedRoomId = params.get("room");
  if (!selectedRoomId) {
    alert("No room selected. Redirecting back to hotel options.");
    location.href = "/";
    return;
  }
  
  // Set up auth handlers
  loginBtn.addEventListener("click", signInWithGoogle);
  
  if (!supabaseClient) {
    authPrompt.classList.add("hidden");
    checkoutShell?.classList.remove("hidden");
    checkoutContainer.classList.remove("hidden");
    return;
  }
  
  // Check active session
  const { data: { session } } = await supabaseClient.auth.getSession();
  if (session) {
    handleUserSession(session);
  } else {
    authPrompt.classList.remove("hidden");
    checkoutShell?.classList.add("hidden");
    checkoutContainer.classList.add("hidden");
    setLandingVideo();
  }
  
  supabaseClient.auth.onAuthStateChange((event, session) => {
    if (session) {
      handleUserSession(session);
    } else {
      authPrompt.classList.remove("hidden");
      checkoutShell?.classList.add("hidden");
      checkoutContainer.classList.add("hidden");
      setLandingVideo();
    }
  });
});

async function handleUserSession(session) {
  authPrompt.classList.add("hidden");
  checkoutShell?.classList.remove("hidden");
  checkoutContainer.classList.add("hidden");
  const meta = session.user?.user_metadata || {};
  const authUserKey = session.user?.id || session.user?.email || "";
  const previousAuthUserKey = localStorage.getItem("stayAuthUserKey");
  if (authUserKey && previousAuthUserKey !== authUserKey) {
    profile = {};
    localStorage.removeItem("stayProfile");
    localStorage.removeItem("stayBookingDetails");
    localStorage.setItem("stayAuthUserKey", authUserKey);
  }
  profile = {
    name: profile.name || meta.full_name || meta.name || "",
    email: session.user?.email || profile.email || "",
    phone: profile.phone || ""
  };
  
  const { data: savedProfile } = await supabaseClient
    .from("customer_profiles")
    .select("name,phone,email")
    .eq("id", session.user.id)
    .maybeSingle();
  if (savedProfile) {
    profile.name = savedProfile.name || profile.name || "";
    profile.phone = savedProfile.phone || profile.phone || "";
    profile.email = session.user.email || savedProfile.email || profile.email || "";
  }
  
  // Load config & details
  await Promise.all([
    loadAllBookings(),
    loadPricingSettings(),
    loadPaymentSettings()
  ]);
  
  room = await loadRoomDetails(selectedRoomId);
  if (!room) {
    alert("Selected stay is no longer available. Redirecting back to hotel options.");
    location.href = "/";
    return;
  }
  
  // Prepopulate form fields
  const params = new URLSearchParams(location.search);
  const today = new Date();
  const tomorrow = new Date(Date.now() + 86400000);
  
  let localSavedDetails = {};
  try {
    localSavedDetails = JSON.parse(localStorage.getItem("stayBookingDetails")) || {};
  } catch (_) {}
  
  const fromParam = params.get("from") || localSavedDetails.from || getLocalDateString(today);
  const toParam = params.get("to") || localSavedDetails.to || getLocalDateString(tomorrow);
  const adultsParam = Number(params.get("adults") || localSavedDetails.adults || 2);
  const kidsParam = Number(params.get("children") || localSavedDetails.children || 0);
  const roomsParam = minRoomsNeededForAdults(room, adultsParam);
  const paymentParam = params.get("payment") || localSavedDetails.payment || "20";
  const firecampParam = params.get("firecamp") === "true" || Boolean(localSavedDetails.firecamp);
  
  bookingName.value = profile.name || localSavedDetails.name || "";
  bookingPhone.value = profile.phone || localSavedDetails.phone || "";
  bookingEmail.value = profile.email || "";
  
  fromInput.value = fromParam;
  fromInput.min = getLocalDateString(today);
  toInput.min = getNextDateString(fromParam);
  toInput.value = toParam;
  
  adultsInput.value = adultsParam;
  childrenInput.value = kidsParam;
  roomsInput.value = roomsParam;
  paymentInput.value = paymentParam;
  firecampInput.checked = firecampParam && hasFirecamp(room);
  travelInterestInput.checked = Boolean(localSavedDetails.travelInterest);
  
  updatePricingUI();
  checkoutContainer.classList.remove("hidden");
  setupCheckoutRealtime();
  
  if (!checkoutListenersWired) {
    checkoutListenersWired = true;
    ["input", "change"].forEach(evtName => {
      [adultsInput, childrenInput, roomsInput, fromInput, toInput, paymentInput, firecampInput].forEach(el => {
        el.addEventListener(evtName, async (e) => {
          if (e.target.id === "adultsInput" && e.type === "change") {
            const rem = getAvailableRoomsCount(room, {
              from: fromInput.value,
              to: toInput.value
            });
            roomsInput.value = Math.min(minRoomsNeededForAdults(room, Number(e.target.value || 1)), rem || 1);
          }
          if (e.target.id === "roomsInput" && e.type === "change") {
            roomsInput.value = fitDetailsToAvailability(room, checkoutDetailsFromForm()).rooms || 1;
          }
          if (e.target.id === "fromInput") {
            const nextDate = getNextDateString(e.target.value);
            toInput.min = nextDate;
            toInput.value = nextDate;
          }
          if ((e.target.id === "fromInput" || e.target.id === "toInput") && e.type === "change") await loadAllBookings();
          updatePricingUI();
        });
      });
    });
    
    manualPaymentBox?.addEventListener("click", openUpiPayment);
    paymentScreenshotInput?.addEventListener("pointerdown", () => { paymentFilePickerOpen = true; });
    paymentScreenshotInput?.addEventListener("click", () => { paymentFilePickerOpen = true; });
    paymentScreenshotInput?.addEventListener("change", () => { setTimeout(() => { paymentFilePickerOpen = false; }, 500); });
    
    bookingForm.addEventListener("submit", handleCheckoutFormSubmit);
  }
}
