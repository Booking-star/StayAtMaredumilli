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
    body.p_customer_email = user.email;
    let id;
    try {
      id = await supabaseRpc("create_booking_safe", body);
    } catch (error) {
      if (!/invalid booking status/i.test(error.message) || body.p_status !== "pending_payment") throw error;
      id = await supabaseRpc("create_booking_safe", { ...body, p_status: "confirmed" });
    }
    if (body.p_screenshot_url) {
      await fetch(`${url}/rest/v1/bookings?id=eq.${id}`, {
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
    }
    res.status(200).json({ id });
  } catch (error) {
    console.error("Manual booking failed:", error.message);
    res.status(400).json({ error: "Booking could not be confirmed. Please check room availability and try again." });
  }
};
