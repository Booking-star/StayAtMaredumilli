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
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  try {
    const user = await authenticatedUser(req);
    if (!user?.email) return res.status(401).json({ error: "Please login again." });
    const holdId = (typeof req.body === "string" ? JSON.parse(req.body || "{}") : req.body || {}).hold_id;
    if (!holdId) return res.status(400).json({ error: "Missing hold." });

    const response = await fetch(`${process.env.SUPABASE_URL}/rest/v1/booking_holds?id=eq.${holdId}&customer_email=eq.${encodeURIComponent(user.email)}&status=eq.held`, {
      method: "PATCH",
      headers: {
        apikey: process.env.SUPABASE_SERVICE_ROLE_KEY,
        authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
        "content-type": "application/json",
        prefer: "return=representation"
      },
      body: JSON.stringify({ status: "expired" })
    });
    if (!response.ok) throw new Error("Release failed.");
    const rows = await response.json().catch(() => []);
    res.status(200).json({ ok: true, released: rows.length > 0 });
  } catch (error) {
    console.error("Release payment hold failed:", error.message);
    res.status(500).json({ error: "Room hold could not be released. Please contact support." });
  }
};
