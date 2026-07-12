const crypto = require("crypto");

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

async function supabaseWrite(path, body, method = "POST") {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const response = await fetch(`${url}/rest/v1/${path}`, {
    method,
    headers: {
      apikey: key,
      authorization: `Bearer ${key}`,
      "content-type": "application/json",
      prefer: "return=representation"
    },
    body: JSON.stringify(body)
  });
  const data = await response.json().catch(() => null);
  if (!response.ok) throw new Error(data?.message || "Supabase write failed.");
  return data;
}

async function getHold(holdId) {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const response = await fetch(`${url}/rest/v1/booking_holds?id=eq.${holdId}&select=*`, {
    headers: {
      apikey: key,
      authorization: `Bearer ${key}`
    }
  });
  const data = await response.json().catch(() => []);
  if (!response.ok || !data?.[0]) throw new Error("Payment hold not found.");
  return data[0];
}

async function createBookingFromPaidHold(hold, paymentId) {
  const existing = await bookingByPayment(paymentId);
  if (existing) return existing;
  const rows = await supabaseWrite("bookings", {
    room_id: hold.room_id,
    customer_name: hold.customer_name || "Customer",
    customer_phone: hold.customer_phone || "N/A",
    customer_email: hold.customer_email || null,
    check_in: hold.check_in,
    check_out: hold.check_out,
    num_rooms: hold.num_rooms,
    num_adults: hold.num_adults,
    num_kids: hold.num_kids,
    total_price: hold.total_price,
    owner_amount: hold.owner_amount,
    profit_amount: hold.profit_amount,
    status: "confirmed",
    payment_option: hold.payment_option,
    payment_id: paymentId,
    influencer_id: hold.influencer_id || null,
    firecamp: Boolean(hold.firecamp)
  });
  const bookingId = rows?.[0]?.id;
  if (!bookingId) throw new Error("Paid booking fallback did not return a booking.");
  await supabaseWrite(`booking_holds?id=eq.${hold.id}`, { status: "confirmed", razorpay_payment_id: paymentId }, "PATCH");
  return bookingId;
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
  try {
    const {
      hold_id,
      razorpay_order_id,
      razorpay_payment_id,
      razorpay_signature
    } = req.body || {};
    if (!hold_id || !razorpay_order_id || !razorpay_payment_id) {
      throw new Error("Missing payment verification details.");
    }
    const hold = await getHold(hold_id);
    if (hold.razorpay_order_id !== razorpay_order_id) throw new Error("Payment order does not match this booking hold.");
    if (hold.status === "confirmed" && hold.razorpay_payment_id === razorpay_payment_id) {
      return res.status(200).json({ booking_id: await bookingByPayment(razorpay_payment_id) || hold_id });
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
    let bookingId;
    try {
      bookingId = await confirmHold(hold_id, razorpay_payment_id);
    } catch (error) {
      console.error("Confirm hold failed after verified payment:", error.message);
      try {
        bookingId = await createBookingFromPaidHold(hold, razorpay_payment_id);
      } catch (fallbackError) {
        console.error("Paid booking fallback failed:", fallbackError.message);
        return res.status(200).json({ booking_id: `PAY-${String(razorpay_payment_id).slice(-8)}`, manual_review: true });
      }
    }
    res.status(200).json({ booking_id: bookingId });
  } catch (error) {
    console.error("Payment verification failed:", error.message);
    res.status(400).json({ error: "Payment verification failed." });
  }
};
