async function supabaseFetch(path) {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Server is not configured.");
  const response = await fetch(`${url}/rest/v1/${path}`, {
    headers: {
      apikey: key,
      authorization: `Bearer ${key}`
    }
  });
  const data = await response.json().catch(() => null);
  if (!response.ok) throw new Error("Status could not be checked.");
  return data;
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

module.exports = async function handler(req, res) {
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });
  try {
    const user = await authenticatedUser(req);
    if (!user?.email) return res.status(401).json({ error: "Please login again." });
    const holdId = String(req.query?.hold_id || "");
    const paymentId = String(req.query?.payment_id || "");
    if (!holdId || !paymentId) return res.status(400).json({ error: "Missing payment details." });

    const emailFilter = encodeURIComponent(user.email);
    const bookings = await supabaseFetch(`bookings?payment_id=eq.${encodeURIComponent(paymentId)}&customer_email=eq.${emailFilter}&select=id&limit=1`);
    if (bookings?.[0]?.id) return res.status(200).json({ booking_id: bookings[0].id });

    const holds = await supabaseFetch(`booking_holds?id=eq.${encodeURIComponent(holdId)}&razorpay_payment_id=eq.${encodeURIComponent(paymentId)}&customer_email=eq.${emailFilter}&status=eq.confirmed&select=id&limit=1`);
    if (holds?.[0]?.id) return res.status(200).json({ booking_id: holds[0].id });

    res.status(202).json({ pending: true });
  } catch {
    res.status(400).json({ error: "Payment status could not be checked." });
  }
};
