export default async function handler(req, res) {
  if (!["GET", "POST"].includes(req.method)) return res.status(405).json({ error: "Method not allowed" });
  const defaultUpiId = "Kandregulaashok1@ybl";
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return res.status(200).json({ mode: "razorpay", upiId: "" });

  if (req.method === "POST") {
    const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : (req.body || {});
    const token = (req.headers.authorization || "").replace(/^Bearer\s+/i, "");
    const userResponse = token && await fetch(`${url}/auth/v1/user`, {
      headers: { apikey: key, authorization: `Bearer ${token}` }
    });
    const user = userResponse?.ok ? await userResponse.json() : null;
    const profileResponse = user?.id && await fetch(`${url}/rest/v1/profiles?id=eq.${user.id}&select=role`, {
      headers: { apikey: key, authorization: `Bearer ${key}` }
    });
    const profile = profileResponse?.ok ? (await profileResponse.json())?.[0] : null;
    if (user?.email !== "admin@stayatmaredumilli.com" && user?.email !== "admin@staymaredumilli.com" && profile?.role !== "admin") {
      return res.status(403).json({ error: "Admin only" });
    }

    const value = {
      mode: ["manual", "mock", "razorpay"].includes(body.mode) ? body.mode : "razorpay",
      upiId: String(body.upiId || "").trim()
    };
    const saveResponse = await fetch(`${url}/rest/v1/site_settings?on_conflict=key`, {
      method: "POST",
      headers: {
        apikey: key,
        authorization: `Bearer ${key}`,
        "content-type": "application/json",
        prefer: "resolution=merge-duplicates,return=minimal"
      },
      body: JSON.stringify({ key: "payment", value, updated_at: new Date().toISOString() })
    });
    if (!saveResponse.ok) return res.status(500).json({ error: "Payment settings could not be saved. Please try again." });
    const verifyResponse = await fetch(`${url}/rest/v1/site_settings?key=eq.payment&select=value`, {
      headers: { apikey: key, authorization: `Bearer ${key}` }
    });
    const saved = verifyResponse.ok ? (await verifyResponse.json())?.[0]?.value : null;
    if (saved?.upiId !== value.upiId || saved?.mode !== value.mode) {
      return res.status(500).json({ error: "Payment settings could not be verified. Please try again." });
    }
    return res.status(200).json(saved);
  }

  const response = await fetch(`${url}/rest/v1/site_settings?key=eq.payment&select=value`, {
    headers: {
      apikey: key,
      authorization: `Bearer ${key}`
    }
  });
  const rows = response.ok ? await response.json() : [];
  const value = rows?.[0]?.value || {};
  res.status(200).json({
    mode: ["manual", "mock", "razorpay"].includes(value.mode) ? value.mode : "razorpay",
    upiId: value.upiId || defaultUpiId
  });
}
