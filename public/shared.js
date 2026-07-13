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

function validDateString(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value || ""))) return false;
  const date = new Date(value);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
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

function validateTripValues({ from, to, adults, children, rooms }) {
  if (!from || !to) return "Please select check-in and check-out dates.";
  if (!validDateString(from) || !validDateString(to)) return "Please select valid check-in and check-out dates.";
  if (to <= from) return "Check-out date must be after check-in date.";
  if (!positiveWholeNumber(adults) || Number(adults) < 1) return "Adults must be a whole number of at least 1.";
  if (!positiveWholeNumber(children) || Number(children) < 0) return "Kids must be a whole number of 0 or more.";
  if (rooms !== undefined && (!positiveWholeNumber(rooms) || Number(rooms) < 1)) return "Rooms must be a whole number of at least 1.";
  return "";
}

function minRoomsForAdults(maxAdultsPerRoom, adults = 1) {
  return Math.max(1, Math.ceil(Number(adults || 1) / Math.max(1, Number(maxAdultsPerRoom || 1))));
}

function normalizeTripDetails(details = {}, maxAdultsPerRoom = 1) {
  const base = { ...defaultTripDetails(), ...(details || {}) };
  return {
    ...base,
    adults: Number(base.adults || 1),
    children: Number(base.children || 0),
    rooms: Math.max(Number(base.rooms || 1), minRoomsForAdults(maxAdultsPerRoom, base.adults))
  };
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

function bookingReference(id) {
  return `SM-${String(id || Date.now()).replace(/-/g, "").slice(0, 8).toUpperCase()}`;
}

function friendlyBookingError(message = "") {
  if (/supabase|vercel|github|environment|row-level security|permission denied|violates|service role|schema cache|rpc|rest\/v1/i.test(message)) return "Booking could not be completed. Please try again or contact support.";
  if (/conflicting key|no_overlapping_bookings/i.test(message)) return "Booking is blocked by an old database overlap rule. Please contact admin to refresh the booking schema.";
  if (/Only .* room|available for the selected dates/i.test(message)) return message;
  if (/capacity/i.test(message)) return "Guest count exceeds this hotel's room capacity. Please reduce guests or select more rooms.";
  if (/expired/i.test(message)) return "Payment time expired. Please try booking again.";
  if (/signature|verification/i.test(message)) return "Payment verification failed. If money was debited, contact support with your payment ID.";
  return message || "Payment failed. Please try again.";
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

function reportClientError(message, source = "", line = 0) {
  if (!message || location.hostname === "127.0.0.1" || location.hostname === "localhost") return;
  navigator.sendBeacon?.("/api/log-client-error", new Blob([JSON.stringify({
    path: location.pathname,
    message: String(message),
    source: String(source),
    line: Number(line) || 0
  })], { type: "application/json" }));
}

if (typeof window !== "undefined") {
  window.addEventListener("error", event => reportClientError(event.message, event.filename, event.lineno));
  window.addEventListener("unhandledrejection", event => reportClientError(event.reason?.message || event.reason || "Unhandled promise rejection"));
}
