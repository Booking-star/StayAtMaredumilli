const fs = require("fs");
const { execFileSync } = require("child_process");

const read = file => fs.readFileSync(file, "utf8");
const fail = message => {
  throw new Error(message);
};

const index = read("index.html");
const css = read("styles.css");
const shared = read("shared.js");
const book = read("book.js");
const app = read("app.js");
const admin = read("admin.js");
const owner = read("owner.js");
const verifyPayment = read("api/verify-payment.js");
const razorpayWebhook = read("api/razorpay-webhook.js");
const releasePaymentHold = read("api/release-payment-hold.js");
const paymentStatus = read("api/payment-status.js");
const paymentSettings = read("api/payment-settings.js");
const manualBooking = read("api/manual-booking.js");
const logClientError = read("api/log-client-error.js");
const seo = read("scripts/generate-seo-pages.js");
const vercel = read("vercel.json");
const visibleRuntime = app + book + admin + owner + read("admin-settings.js") + read("login.html");
[
  "app.js",
  "book.js",
  "admin.js",
  "owner.js",
  "shared.js",
  "admin-settings.js",
  "public/app.js",
  "public/book.js",
  "public/admin.js",
  "public/owner.js",
  "public/shared.js",
  "public/admin-settings.js"
].forEach(file => execFileSync(process.execPath, ["--check", file], { stdio: "pipe" }));

if ((index.match(/terms-of-service/g) || []).length !== 1) fail("Terms link should appear once on home/profile.");
if ((index.match(/cancellation-policy/g) || []).length !== 1) fail("Cancellation link should appear once on home/profile.");
if (!index.includes("support-list")) fail("Support should use formatted rows, not one paragraph.");
if (!index.includes("app-room-ui.js")) fail("Room UI helper must load before app.js.");
if (!/<\/div>\s*<nav class="bottom-nav hidden">/.test(index)) fail("Bottom nav must live outside #app.");
if (!/\.bottom-nav\s*{[\s\S]*position:\s*fixed\s*!important/.test(css)) fail("Bottom nav must stay fixed.");
if (!/\.bottom-nav\s*{[\s\S]*transform:\s*none\s*!important/.test(css)) fail("Bottom nav must not use transform on mobile.");
if (!app.includes("function positionBottomNav")) fail("Bottom nav reset helper is missing.");
if (/visualViewport\?\.(addEventListener|removeEventListener)[\s\S]{0,80}positionBottomNav/.test(app)) fail("Bottom nav must not be repositioned on visual viewport scroll.");
if (/window\.addEventListener\("scroll",\s*positionBottomNav/.test(app)) fail("Bottom nav must not be repositioned on page scroll.");
if (!css.includes("--bottom-nav-space: 156px")) fail("Mobile bottom spacing must protect content from nav overlap.");
if (!/supabase\|vercel\|github\|environment\|row-level security\|permission denied\|violates/.test(shared)) fail("Backend errors must be masked for customers.");
if (!read("admin-ui.js").includes("cleanAdminMessage") || !read("admin-ui.js").includes("vercel|github|environment")) fail("Admin status must mask raw backend permission errors.");
if (!owner.includes("ownerFriendlyError") || !owner.includes("vercel|github|environment")) fail("Owner status must mask raw backend permission errors.");
if (/alert\([^)]*error\.message|innerHTML\s*=[^;]*error\.message/.test(admin + owner)) fail("Admin/owner UI must not show raw backend errors.");
if (/Backend (connected|not connected|is not connected)/.test(visibleRuntime)) fail("Runtime UI must not mention backend infrastructure.");
if (/javascript:/i.test(index + app + book + read("book.html"))) fail("Customer UI must not use javascript: pseudo-links.");
if (/notifyAdmin\(`[^`]*\$\{error\.message\}/.test(read("admin-settings.js"))) fail("Admin settings must not show raw backend errors.");
if (!admin.includes('.from("booking_occupancy")') || !admin.includes("allOccupancy")) fail("Admin availability must use shared occupancy, including live payment holds.");
if (!owner.includes('.from("booking_occupancy")') || !owner.includes("allOccupancy")) fail("Owner availability must use shared occupancy, including live payment holds.");
if (!owner.includes('table: "booking_holds"')) fail("Owner availability must refresh when payment holds change.");
if (owner.includes("'Cancel Booking'") || !owner.includes("Customer bookings cannot be released")) fail("Owner panel must not allow releasing paid customer bookings.");
if (!owner.includes('modalSubmitRelease.dataset.bookingId = ""') || !owner.includes("modalSubmitRelease.classList.add(\"hidden\")")) fail("Owner block modal must hide release action when creating a new block.");
if (!book.includes('loading="lazy" decoding="async"')) fail("Booking room image should not block checkout rendering.");
if (book.includes("adultsInput.value = fitted.adults")) fail("Adult input must not be rewritten while typing.");
if (!book.includes("document.activeElement !== roomsInput")) fail("Room input must not be rewritten while typing.");
if (!book.includes('e.target.id === "adultsInput" && e.type === "change"')) fail("Adult room auto-fit should run on commit, not every keystroke.");
if (!book.includes("const tripError = validateTripValues(formDetails)")) fail("Checkout must validate trip fields before payment.");
if (!book.includes('localStorage.setItem("stayProfile"')) fail("Booking contact details should persist to profile.");
if (!book.includes('let profile = getStore("stayProfile", {})')) fail("Checkout must start from the saved customer profile.");
if (!book.includes("bookingName.value = profile.name || localSavedDetails.name")) fail("Checkout must prefer saved profile contact details over stale trip details.");
if (/9999999999|customer@stay\.com/.test(book)) fail("Paid checkout must not use fake customer contact fallbacks.");
if (/(p_customer_name|customer_name):\s*[^,\n]*\|\|\s*["']Customer["']/.test(app + book)) fail("Bookings must not invent a fake customer name.");
if (book.includes("bookingEmail.value = localSavedDetails.email")) fail("Checkout email must come from the logged-in session, not stale saved details.");
if (!book.includes("checkoutListenersWired")) fail("Checkout listeners must only be wired once.");
if (!book.includes("normalizePhone") || !book.includes('digits.startsWith("91")')) fail("Checkout must accept +91 Indian mobile numbers.");
if (!read("api/create-payment-hold.js").includes("normalizePhone")) fail("Payment API must normalize customer phone numbers server-side.");
if (!app.includes('{ mode: "razorpay", upiId: "" }') || !book.includes('{ mode: "razorpay", upiId: "" }')) fail("Customer payment mode must default to Razorpay, not manual UPI.");
if (/service role key|Check Supabase/i.test(paymentSettings)) fail("Payment settings API must not expose infrastructure wording.");
if (paymentSettings.includes('? body.mode : "manual"')) fail("Payment settings must default to Razorpay.");
if (!app.includes("function normalizePhone") || !app.includes("Please enter a valid 10 digit mobile number.")) fail("Profile phone save must normalize and validate Indian mobile numbers.");
if (!app.includes('.from("rooms_public").select("id,room_name,image_urls")') || app.includes("rooms(room_name,image_urls)")) fail("Customer bookings must load room display data from rooms_public, not private rooms.");
if (!app.includes('booking.roomImage || "/brand-logo.png"')) fail("Customer booking cards need a real image fallback.");
if (!manualBooking.includes('mode === "razorpay"') || !manualBooking.includes('p_screenshot_url')) fail("Manual booking API must reject Razorpay mode and require screenshot in manual mode.");
if (!/if\s*\(\s*body\.p_attach_booking_id[\s\S]{0,120}mode === "razorpay"/.test(manualBooking)) fail("Manual screenshot attach must reject Razorpay mode before updating bookings.");
if (manualBooking.includes('p_status: "confirmed"')) fail("Manual booking API must not silently create confirmed bookings.");
if (!verifyPayment.includes("async function razorpayPayment") || !verifyPayment.includes("validSignature")) fail("Razorpay verify must have server-side fallback.");
if (!verifyPayment.includes("bookingByPayment") || !verifyPayment.includes('hold.status === "confirmed"')) fail("Razorpay verify must be idempotent after webhook confirmation.");
if (verifyPayment.includes("createBookingFromPaidHold") || verifyPayment.includes("supabaseWrite(\"bookings\"")) fail("Razorpay verify must not bypass the safe booking RPC.");
if (!book.includes("waitForPaymentConfirmation") || !paymentStatus.includes("booking_id")) fail("Checkout must recover after webhook confirms a paid booking.");
if (!book.includes("/api/payment-status") || !book.includes("authorization: `Bearer")) fail("Payment status polling must include the logged-in session token.");
if (!paymentStatus.includes("authenticatedUser") || !paymentStatus.includes("customer_email=eq.")) fail("Payment status API must be customer-scoped.");
if (/booking_holds\?id=eq\.\$\{(holdId|hold\.hold_id)\}/.test(verifyPayment + releasePaymentHold + read("api/create-payment-hold.js"))) fail("Payment hold IDs must be URL-encoded in API filters.");
if (razorpayWebhook.includes("createBookingFromPaidHold") || razorpayWebhook.includes('supabaseFetch("bookings"')) fail("Razorpay webhook must not bypass the safe booking RPC.");
if (!book.includes("/api/release-payment-hold") || !book.includes("Payment failed. Rooms were released.")) fail("Failed Razorpay payments must release held rooms.");
if (!releasePaymentHold.includes("status=eq.held") || !releasePaymentHold.includes('status: "expired"')) fail("Release hold API must only expire held rooms.");
if (!releasePaymentHold.includes("!response.ok") || !releasePaymentHold.includes("return=representation")) fail("Release hold API must verify the database update.");
if (!logClientError.includes("rateLimited") || !logClientError.includes("recent.length > 20")) fail("Client error logging must be rate limited.");
if (!seo.includes('decoding="async"')) fail("SEO hotel images should decode asynchronously.");
if (/hotel-detail-slides[\s\S]{0,4000}loading="lazy"/.test(seo)) fail("Hotel detail carousel images must not be lazy-loaded offscreen.");
if (!vercel.includes('"X-Frame-Options"') || !vercel.includes('"DENY"')) fail("Clickjacking header missing.");

console.log("static ux/security check passed");
