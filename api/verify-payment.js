const crypto = require("crypto");
const { sendBookingEmailsOnce } = require("./email");

async function confirmHold(holdId, paymentId) {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url) throw new Error("Missing SUPABASE_URL in Vercel.");
  if (!key) throw new Error("Missing SUPABASE_SERVICE_ROLE_KEY in Vercel.");
  const response = await fetch(`${url}/rest/v1/rpc/confirm_booking_hold_safe`, {
    method: "POST",
    headers: {
      apikey: key,
      authorization: `Bearer ${key}`,
      "content-type": "application/json"
    },
    body: JSON.stringify({
      p_hold_id: holdId,
      p_razorpay_payment_id: paymentId
    })
  });
  const data = await response.json().catch(() => null);
  if (!response.ok) throw new Error(data?.message || "Could not confirm booking.");
  return data;
}

async function bookingByPayment(paymentId) {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const response = await fetch(`${url}/rest/v1/bookings?payment_id=eq.${encodeURIComponent(paymentId)}&select=id&limit=1`, {
    headers: {
      apikey: key,
      authorization: `Bearer ${key}`
    }
  });
  const data = await response.json().catch(() => []);
  if (!response.ok) throw new Error(data?.message || "Could not load confirmed booking.");
  return data?.[0]?.id || null;
}

async function getHold(holdId) {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const response = await fetch(`${url}/rest/v1/booking_holds?id=eq.${encodeURIComponent(holdId)}&select=*`, {
    headers: {
      apikey: key,
      authorization: `Bearer ${key}`
    }
  });
  const data = await response.json().catch(() => []);
  if (!response.ok || !data?.[0]) throw new Error("Payment hold not found.");
  return data[0];
}

async function authenticatedUser(req) {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const token = String(req.headers.authorization || "").replace(/^Bearer\s+/i, "");
  if (!url || !key || !token) return null;
  const response = await fetch(`${url}/auth/v1/user`, {
    headers: { apikey: key, authorization: `Bearer ${token}` }
  });
  return response.ok ? response.json() : null;
}

async function razorpayPayment(paymentId) {
  const keyId = process.env.RAZORPAY_KEY_ID;
  const keySecret = process.env.RAZORPAY_KEY_SECRET;
  if (!keyId || !keySecret) throw new Error("Razorpay keys are not configured.");
  const auth = Buffer.from(`${keyId}:${keySecret}`).toString("base64");
  const response = await fetch(`https://api.razorpay.com/v1/payments/${encodeURIComponent(paymentId)}`, {
    headers: { authorization: `Basic ${auth}` }
  });
  const data = await response.json().catch(() => null);
  if (!response.ok) throw new Error(data?.error?.description || "Could not verify Razorpay payment.");
  return data;
}

function validSignature(orderId, paymentId, signature) {
  if (!signature) return false;
  const expected = crypto
    .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET || "")
    .update(`${orderId}|${paymentId}`)
    .digest("hex");
  const expectedBuffer = Buffer.from(expected);
  const receivedBuffer = Buffer.from(String(signature));
  return expectedBuffer.length === receivedBuffer.length && crypto.timingSafeEqual(expectedBuffer, receivedBuffer);
}

module.exports = async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  let hold_id;
  let razorpay_order_id;
  let razorpay_payment_id;
  try {
    const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : req.body || {};
    hold_id = body.hold_id;
    razorpay_order_id = body.razorpay_order_id;
    razorpay_payment_id = body.razorpay_payment_id;
    const razorpay_signature = body.razorpay_signature;
    if (!hold_id || !razorpay_order_id || !razorpay_payment_id) {
      throw new Error("Missing payment verification details.");
    }
    const user = await authenticatedUser(req);
    if (!user?.email) return res.status(401).json({ error: "Please login again." });
    const hold = await getHold(hold_id);
    if (hold.customer_email !== user.email) return res.status(403).json({ error: "Payment verification failed." });
    if (hold.razorpay_order_id !== razorpay_order_id) throw new Error("Payment order does not match this booking hold.");
    if (hold.status === "confirmed" && hold.razorpay_payment_id === razorpay_payment_id) {
      const existingBookingId = await bookingByPayment(razorpay_payment_id) || hold_id;
      await sendBookingEmailsOnce({ bookingId: existingBookingId, hold, paymentId: razorpay_payment_id }).catch(error => {
        console.error("Booking email failed:", error.message);
      });
      return res.status(200).json({ booking_id: existingBookingId });
    }
    if (!validSignature(razorpay_order_id, razorpay_payment_id, razorpay_signature)) {
      const payment = await razorpayPayment(razorpay_payment_id);
      if (
        payment.order_id !== razorpay_order_id ||
        !["captured", "authorized"].includes(payment.status) ||
        Number(payment.amount) !== Number(hold.payable_amount) * 100
      ) {
        throw new Error("Payment signature mismatch.");
      }
    }
    const bookingId = await confirmHold(hold_id, razorpay_payment_id);
    await sendBookingEmailsOnce({ bookingId, hold, paymentId: razorpay_payment_id }).catch(error => {
      console.error("Booking email failed:", error.message);
    });
    res.status(200).json({ booking_id: bookingId });
  } catch (error) {
    console.error("Payment verification failed:", error.message, {
      hold_id,
      razorpay_order_id,
      razorpay_payment_id
    });
    res.status(400).json({ error: "Payment verification failed." });
  }
};
