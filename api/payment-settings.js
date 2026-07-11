export default async function handler(req, res) {
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return res.status(200).json({ mode: "manual", upiId: "" });

  const response = await fetch(`${url}/rest/v1/site_settings?key=eq.payment&select=value`, {
    headers: {
      apikey: key,
      authorization: `Bearer ${key}`
    }
  });
  const rows = response.ok ? await response.json() : [];
  const value = rows?.[0]?.value || {};
  res.status(200).json({
    mode: ["manual", "mock", "razorpay"].includes(value.mode) ? value.mode : "manual",
    upiId: value.upiId || ""
  });
}
