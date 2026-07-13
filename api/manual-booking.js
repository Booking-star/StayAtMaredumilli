async function supabaseRpc(name, body) {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Server booking is not configured.");
  const response = await fetch(`${url}/rest/v1/rpc/${name}`, {
    method: "POST",
    signal: AbortSignal.timeout(15000),
    headers: {
      apikey: key,
      authorization: `Bearer ${key}`,
      "content-type": "application/json"
    },
    body: JSON.stringify(body)
  });
  const data = await response.json().catch(() => null);
  if (!response.ok) throw new Error(data?.message || "Booking could not be created.");
  return data;
}

async function paymentMode(url, key) {
  const response = await fetch(`${url}/rest/v1/site_settings?key=eq.payment&select=value`, {
    signal: AbortSignal.timeout(10000),
    headers: { apikey: key, authorization: `Bearer ${key}` }
  });
  const value = response.ok ? (await response.json())?.[0]?.value : null;
  return ["manual", "mock", "razorpay"].includes(value?.mode) ? value.mode : "razorpay";
}

module.exports = async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  try {
    const token = (req.headers.authorization || "").replace(/^Bearer\s+/i, "");
    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const userResponse = token && await fetch(`${url}/auth/v1/user`, {
      signal: AbortSignal.timeout(10000),
      headers: { apikey: key, authorization: `Bearer ${token}` }
    });
    const user = userResponse?.ok ? await userResponse.json() : null;
    if (!user?.email) return res.status(401).json({ error: "Please login again before booking." });

    const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : (req.body || {});
    const mode = await paymentMode(url, key);
    if (body.p_attach_booking_id && body.p_screenshot_url) {
      if (mode === "razorpay") return res.status(403).json({ error: "Please use secure online payment for booking." });
      const attachResponse = await fetch(`${url}/rest/v1/bookings?id=eq.${body.p_attach_booking_id}&customer_email=eq.${encodeURIComponent(user.email)}`, {
        method: "PATCH",
        signal: AbortSignal.timeout(10000),
        headers: {
          apikey: key,
          authorization: `Bearer ${key}`,
          "content-type": "application/json",
          prefer: "return=representation"
        },
        body: JSON.stringify({
          payment_screenshot_url: body.p_screenshot_url,
          manual_payment_status: "submitted"
        })
      });
      if (!attachResponse.ok) return res.status(500).json({ error: "Payment screenshot could not be saved." });
      const rows = await attachResponse.json().catch(() => []);
      if (!rows.length) return res.status(404).json({ error: "Booking was not found." });
      return res.status(200).json({ ok: true });
    }
    body.p_customer_email = user.email;
    if (mode === "razorpay") return res.status(403).json({ error: "Please use secure online payment for booking." });
    if (mode === "manual" && (body.p_status !== "pending_payment" || !body.p_screenshot_url)) {
      return res.status(400).json({ error: "Payment screenshot is required before submitting a manual booking." });
    }
    if (mode !== "mock") body.p_status = "pending_payment";
    const id = await supabaseRpc("create_booking_safe", body);
    if (body.p_screenshot_url) {
      const attachResponse = await fetch(`${url}/rest/v1/bookings?id=eq.${id}`, {
        method: "PATCH",
        signal: AbortSignal.timeout(10000),
        headers: {
          apikey: key,
          authorization: `Bearer ${key}`,
          "content-type": "application/json"
        },
        body: JSON.stringify({
          payment_screenshot_url: body.p_screenshot_url,
          manual_payment_status: "submitted"
        })
      });
      if (!attachResponse.ok) throw new Error("Payment screenshot could not be saved.");
    }
    res.status(200).json({ id });
  } catch (error) {
    console.error("Manual booking failed:", error.message);
    res.status(400).json({ error: "Booking could not be confirmed. Please check room availability and try again." });
  }
};
