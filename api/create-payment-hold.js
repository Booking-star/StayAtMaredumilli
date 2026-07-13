async function supabaseRpc(name, body) {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url) throw new Error("Missing SUPABASE_URL in Vercel.");
  if (!key) throw new Error("Missing SUPABASE_SERVICE_ROLE_KEY in Vercel.");
  const response = await fetch(`${url}/rest/v1/rpc/${name}`, {
    method: "POST",
    headers: {
      apikey: key,
      authorization: `Bearer ${key}`,
      "content-type": "application/json"
    },
    body: JSON.stringify(body)
  });
  const data = await response.json().catch(() => null);
  if (!response.ok) throw new Error(data?.message || "Supabase request failed.");
  return data;
}

async function authenticatedUser(req) {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const token = String(req.headers.authorization || "").replace(/^Bearer\s+/i, "");
  if (!url || !key) return null;
  if (!token) return null;
  const response = await fetch(`${url}/auth/v1/user`, {
    headers: { apikey: key, authorization: `Bearer ${token}` }
  });
  return response.ok ? response.json() : null;
}

async function razorpayOrder(amount, receipt) {
  const keyId = process.env.RAZORPAY_KEY_ID;
  const keySecret = process.env.RAZORPAY_KEY_SECRET;
  if (!keyId || !keySecret) throw new Error("Razorpay keys are not configured.");
  const auth = Buffer.from(`${keyId}:${keySecret}`).toString("base64");
  const response = await fetch("https://api.razorpay.com/v1/orders", {
    method: "POST",
    headers: {
      authorization: `Basic ${auth}`,
      "content-type": "application/json"
    },
    body: JSON.stringify({
      amount: amount * 100,
      currency: "INR",
      receipt,
      payment_capture: 1
    })
  });
  const data = await response.json().catch(() => null);
  if (!response.ok) throw new Error(data?.error?.description || "Failed to create Razorpay order.");
  return data;
}

const hits = new Map();
function rateLimited(req) {
  const ip = String(req.headers["x-forwarded-for"] || req.socket?.remoteAddress || "unknown").split(",")[0];
  const now = Date.now();
  const recent = (hits.get(ip) || []).filter(t => now - t < 60000);
  recent.push(now);
  hits.set(ip, recent);
  return recent.length > 10;
}

function validPhone(value) {
  return String(value || "").replace(/\D/g, "").length === 10;
}

module.exports = async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  if (rateLimited(req)) return res.status(429).json({ error: "Too many payment attempts. Please wait a minute and try again." });
  try {
    const user = await authenticatedUser(req);
    if (!user?.email) return res.status(401).json({ error: "Please login again before payment." });
    const body = req.body || {};
    if (!String(body.p_customer_name || "").trim()) return res.status(400).json({ error: "Please enter your full name." });
    if (!validPhone(body.p_customer_phone)) return res.status(400).json({ error: "Please enter a valid 10 digit mobile number." });
    const hold = await supabaseRpc("create_booking_hold_safe", { ...body, p_customer_email: user.email });
    const order = await razorpayOrder(hold.payable_amount, hold.hold_id);
    const update = await fetch(`${process.env.SUPABASE_URL}/rest/v1/booking_holds?id=eq.${hold.hold_id}`, {
      method: "PATCH",
      headers: {
        apikey: process.env.SUPABASE_SERVICE_ROLE_KEY,
        authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
        "content-type": "application/json"
      },
      body: JSON.stringify({ razorpay_order_id: order.id })
    });
    if (!update.ok) throw new Error("Payment order was created, but the room hold could not be updated.");
    res.status(200).json({
      key_id: process.env.RAZORPAY_KEY_ID,
      order_id: order.id,
      hold_id: hold.hold_id,
      amount: hold.payable_amount,
      total_amount: hold.total_amount,
      expires_at: hold.expires_at
    });
  } catch (error) {
    console.error("Payment hold failed:", error.message);
    res.status(400).json({ error: "Payment could not be started. Please check availability and try again." });
  }
};
