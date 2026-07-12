// book.js - Checkout Controller for Stay@Maredumilli

const supabaseConfig = window.STAY_SUPABASE || {};
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

// DOM Elements
const authPrompt = document.getElementById("authPrompt");
const loginBtn = document.getElementById("loginBtn");
const checkoutContainer = document.getElementById("checkoutContainer");
const bookingForm = document.getElementById("bookingForm");
const bookingRoomSummary = document.getElementById("bookingRoomSummary");
const billSummary = document.getElementById("billSummary");
const submitBtn = document.getElementById("submitBtn");

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
let profile = {};
let pricingSettings = { occupancy80Surcharge: 200, occupancy90Surcharge: 300 };
let paymentSettings = { mode: "manual", upiId: "Kandregulaashok1@ybl" };
let selectedRoomId = null;
let paymentFilePickerOpen = false;

// Helper Functions
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

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function hasFirecamp(roomObj) {
  if (!roomObj) return false;
  const list = Array.isArray(roomObj.amenities) ? roomObj.amenities : String(roomObj.amenities || "").split(",");
  return list.some(item => /firecamp/i.test(item));
}

function firecampPrice(roomsCount = 1) {
  return Number(roomsCount || 1) <= 2 ? 600 : 1000;
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

function minRoomsForAdults(roomObj, adults = 1) {
  const maxAdults = Math.max(1, Number(roomObj?.maxAdults || 1));
  return Math.max(1, Math.ceil(Number(adults || 1) / maxAdults));
}

function detailsForRoom(roomObj, details = null) {
  const adults = Number(details?.adults || 1);
  const roomsNeeded = minRoomsForAdults(roomObj, adults);
  return {
    ...(details || {}),
    adults,
    rooms: Math.max(Number(details?.rooms || 1), roomsNeeded)
  };
}

function fitDetailsToAvailability(roomObj, details = null) {
  const fitted = detailsForRoom(roomObj, details);
  const remaining = getAvailableRoomsCount(roomObj, fitted);
  const maxRooms = Math.max(0, remaining);
  const maxAdults = maxRooms * Math.max(1, Number(roomObj.maxAdults || 1));
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

async function fetchJsonWithTimeout(url, options = {}, ms = 25000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  try {
    const response = await fetch(url, { ...options, signal: controller.signal });
    const data = await response.json().catch(() => ({}));
    return { response, data };
  } catch (error) {
    if (error.name === "AbortError") throw new Error("Booking is taking too long. Please check your bookings tab before trying again.");
    throw error;
  } finally {
    clearTimeout(timer);
  }
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
    : { mode: "manual", upiId: "Kandregulaashok1@ybl" };
}

async function loadAllBookings() {
  if (!supabaseClient) return;
  const { data, error } = await supabaseClient
    .from("booking_occupancy")
    .select("*");
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

// Payment Methods
function setManualPaymentLinks(amount, roomObj) {
  const upiId = (paymentSettings.upiId || "").trim();
  const reference = `SM${Date.now().toString().slice(-8)}`;
  const params = new URLSearchParams({
    pa: upiId,
    pn: "StayAtMaredumilli",
    am: Number(amount || 0).toFixed(2),
    cu: "INR",
    tr: reference,
    tn: `${roomObj?.name || "Stay"} booking`
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
    manualPhonePeLink.href = "javascript:void(0)";
    manualPhonePeLink.dataset.paymentUrl = disabled ? "" : phonePeUrl;
  }
  if (manualUpiLink) manualUpiLink.href = "javascript:void(0)";
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
  const frame = document.createElement("iframe");
  frame.style.display = "none";
  frame.src = url;
  document.body.appendChild(frame);
  setTimeout(() => frame.remove(), 3000);
  setTimeout(() => {
    if (document.visibilityState === "visible") alert("If your payment app did not open, copy the UPI ID shown here and pay manually, then upload the screenshot.");
  }, 1800);
}

async function startRazorpayPayment(order, details, roomObj, pricing) {
  return new Promise((resolve, reject) => {
    const checkout = new Razorpay({
      key: order.key_id,
      amount: order.amount * 100,
      currency: "INR",
      name: "Stay@Maredumilli",
      description: `${roomObj.name} booking`,
      order_id: order.order_id,
      prefill: {
        name: details.name || profile.name || "",
        email: details.email || profile.email || "",
        contact: details.phone || profile.phone || ""
      },
      notes: {
        hold_id: order.hold_id,
        room_id: roomObj.id
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
        ondismiss: () => {
          reject(new Error("Payment was not completed. Rooms will be released after 5 minutes."));
        }
      }
    });
    checkout.open();
  });
}

async function createMockBooking(roomObj, details, pricing, status = "confirmed", screenshotUrl = "") {
  if (!supabaseClient) return Date.now();
  const { data: sessionData } = await supabaseClient.auth.getSession();
  const { response, data: result } = await fetchJsonWithTimeout("/api/manual-booking", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${sessionData.session?.access_token || ""}`
    },
    body: JSON.stringify({
      p_room_id: roomObj.id,
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
  }, 8000);
  if (!response.ok) throw new Error(result.error || "Booking could not be confirmed.");
  return result.id || Date.now();
}

async function attachManualScreenshotLater(bookingId, file) {
  if (!bookingId || !file || !supabaseClient) return;
  try {
    validateImageFile(file);
    const screenshotUrl = await fileToDataUrl(file);
    const { data: sessionData } = await supabaseClient.auth.getSession();
    await fetch("/api/manual-booking", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${sessionData.session?.access_token || ""}`
      },
      body: JSON.stringify({ p_attach_booking_id: bookingId, p_screenshot_url: screenshotUrl })
    });
  } catch (error) {
    console.warn("Payment screenshot sync failed:", error.message);
  }
}

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
  return {
    adults: Number(adultsInput.value),
    children: Number(childrenInput.value),
    rooms: Number(roomsInput.value),
    from: fromInput.value,
    to: toInput.value,
    payment: paymentInput.value,
    travelInterest: travelInterestInput.checked,
    firecamp: firecampInput.checked
  };
}

function updatePricingUI() {
  if (!room) return;
  
  const formDetails = checkoutDetailsFromForm();
  const fitted = fitDetailsToAvailability(room, formDetails);
  
  adultsInput.value = fitted.adults;
  roomsInput.value = fitted.rooms;
  roomsInput.max = fitted.maxRooms || "";
  submitBtn.disabled = !fitted.maxRooms;
  
  const pricing = priceForDates(room, fitted);
  const selectedRoomsCount = Number(fitted.rooms || 1);
  const roomTotal = pricing.total;
  const firecampAmount = firecampPrice(selectedRoomsCount);
  const firecampTotal = firecampInput.checked && hasFirecamp(room) ? firecampAmount : 0;
  const total = roomTotal + firecampTotal;
  const paymentPercent = Number(paymentInput.value || 20);
  const payNow = Math.round(total * paymentPercent / 100);
  
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
    <img src="${escapeHtml(safeUrl(room.images[0]))}" alt="${escapeHtml(room.name)}">
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
    ${fitted.partialFit ? `<p class="capacity-warning">Booking ${fitted.maxAdults} adult(s) here. Please book the remaining ${fitted.requestedAdults - fitted.maxAdults} adult(s) in another hotel.</p>` : ""}
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
  const guestPhone = bookingPhone.value.trim();
  const guestEmail = bookingEmail.value.trim();
  const manualMode = paymentSettings.mode !== "razorpay" && paymentSettings.mode !== "mock";
  const screenshotFile = paymentScreenshotInput?.files?.[0] || null;
  
  if (manualMode && !paymentSettings.upiId?.trim()) {
    alert("UPI payment is not configured yet. Please contact support.");
    return;
  }
  if (manualMode && !screenshotFile) {
    alert("Please pay by UPI and upload the payment screenshot before confirming.");
    return;
  }
  
  const formDetails = checkoutDetailsFromForm();
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
      bookingId = await startRazorpayPayment(hold, savedDetailsObj, room, pricing);
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
    alert(error.message || "Google login is not available yet.");
  }
}

// Init
window.addEventListener("DOMContentLoaded", async () => {
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
    checkoutContainer.classList.remove("hidden");
    return;
  }
  
  // Check active session
  const { data: { session } } = await supabaseClient.auth.getSession();
  if (session) {
    handleUserSession(session);
  } else {
    authPrompt.classList.remove("hidden");
    checkoutContainer.classList.add("hidden");
  }
  
  supabaseClient.auth.onAuthStateChange((event, session) => {
    if (session) {
      handleUserSession(session);
    } else {
      authPrompt.classList.remove("hidden");
      checkoutContainer.classList.add("hidden");
    }
  });
});

async function handleUserSession(session) {
  const meta = session.user?.user_metadata || {};
  profile = {
    name: meta.full_name || meta.name || profile.name || "",
    email: session.user?.email || profile.email || "",
    phone: profile.phone || ""
  };
  
  // Fetch full profile (e.g. phone number) if it exists
  const profileRes = await supabaseClient.rpc("upsert_customer_profile", {
    p_name: profile.name,
    p_email: profile.email,
    p_phone: ""
  });
  if (!profileRes.error && profileRes.data) {
    profile.phone = profileRes.data.phone || "";
  }
  
  authPrompt.classList.add("hidden");
  checkoutContainer.classList.remove("hidden");
  
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
  const roomsParam = Number(params.get("rooms") || localSavedDetails.rooms || 1);
  const paymentParam = params.get("payment") || localSavedDetails.payment || "20";
  const firecampParam = params.get("firecamp") === "true" || Boolean(localSavedDetails.firecamp);
  
  bookingName.value = localSavedDetails.name || profile.name || "";
  bookingPhone.value = localSavedDetails.phone || profile.phone || "";
  bookingEmail.value = localSavedDetails.email || profile.email || "";
  
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
  
  // Wire up change listeners
  ["input", "change"].forEach(evtName => {
    [adultsInput, childrenInput, roomsInput, fromInput, toInput, paymentInput, firecampInput].forEach(el => {
      el.addEventListener(evtName, (e) => {
        if (e.target.id === "adultsInput") {
          const rem = getAvailableRoomsCount(room, {
            from: fromInput.value,
            to: toInput.value
          });
          roomsInput.value = Math.min(minRoomsForAdults(room, Number(e.target.value || 1)), rem || 1);
        }
        if (e.target.id === "fromInput") {
          const nextDate = getNextDateString(e.target.value);
          toInput.min = nextDate;
          toInput.value = nextDate;
        }
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
