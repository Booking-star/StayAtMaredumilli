function env() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Server is not configured.");
  return { url, key };
}

async function serviceFetch(path, options = {}) {
  const { url, key } = env();
  const response = await fetch(`${url}${path}`, {
    ...options,
    signal: AbortSignal.timeout(options.timeout || 15000),
    headers: {
      apikey: key,
      authorization: `Bearer ${key}`,
      "content-type": "application/json",
      ...(options.headers || {})
    }
  });
  const data = await response.json().catch(() => null);
  if (!response.ok) throw new Error(data?.msg || data?.message || data?.error || "Request failed.");
  return data;
}

async function currentUser(req) {
  const token = String(req.headers.authorization || "").replace(/^Bearer\s+/i, "");
  if (!token) return null;
  const { url, key } = env();
  const response = await fetch(`${url}/auth/v1/user`, {
    signal: AbortSignal.timeout(10000),
    headers: { apikey: key, authorization: `Bearer ${token}` }
  });
  return response.ok ? response.json() : null;
}

async function requireAdmin(req) {
  const user = await currentUser(req);
  if (!user?.id) throw Object.assign(new Error("Please login again."), { status: 401 });
  const rows = await serviceFetch(`/rest/v1/profiles?id=eq.${encodeURIComponent(user.id)}&select=role&limit=1`);
  const profile = rows?.[0];
  const allowed =
    user.email === "admin@stayatmaredumilli.com" ||
    user.email === "admin@staymaredumilli.com" ||
    profile?.role === "admin";
  if (!allowed) throw Object.assign(new Error("Super admin access only."), { status: 403 });
  return user;
}

function cleanInput(body = {}) {
  const email = String(body.email || "").trim().toLowerCase();
  const password = String(body.password || "");
  const name = String(body.name || "").trim();
  const hotelId = String(body.hotel_id || "").trim();
  const role = body.role === "owner" ? "owner" : "member";
  if (!name || !email || !password || !hotelId) throw new Error("Please fill all required team member details.");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error("Please enter a valid email address.");
  if (password.length < 6) throw new Error("Password must be at least 6 characters.");
  return { email, password, name, hotelId, role };
}

async function createConfirmedUser({ email, password, name }) {
  const data = await serviceFetch("/auth/v1/admin/users", {
    method: "POST",
    body: JSON.stringify({
      email,
      password,
      email_confirm: true,
      user_metadata: { name }
    })
  });
  const user = data?.user || data;
  if (!user?.id) throw new Error("Team login could not be created.");
  return user;
}

async function verifyHotel(hotelId) {
  const rows = await serviceFetch(`/rest/v1/hotel_owners?id=eq.${encodeURIComponent(hotelId)}&active=eq.true&select=id&limit=1`);
  if (!rows?.[0]) throw new Error("Selected hotel is not available.");
}

async function saveMembership({ hotelId, userId, role }) {
  await serviceFetch("/rest/v1/hotel_members?on_conflict=hotel_id,user_id", {
    method: "POST",
    headers: { prefer: "resolution=merge-duplicates,return=representation" },
    body: JSON.stringify({
      hotel_id: hotelId,
      user_id: userId,
      role,
      status: "active",
      joined_at: new Date().toISOString()
    })
  });
}

async function saveProfile(userId) {
  await serviceFetch("/rest/v1/profiles?on_conflict=id", {
    method: "POST",
    headers: { prefer: "resolution=merge-duplicates,return=minimal" },
    body: JSON.stringify({
      id: userId,
      role: "owner"
    })
  });
}

module.exports = async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  try {
    await requireAdmin(req);
    const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : req.body || {};
    const input = cleanInput(body);
    await verifyHotel(input.hotelId);
    const user = await createConfirmedUser(input);
    await saveProfile(user.id);
    await saveMembership({ hotelId: input.hotelId, userId: user.id, role: input.role });
    return res.status(200).json({ user_id: user.id });
  } catch (error) {
    console.error("Admin team member create failed:", error.message);
    return res.status(error.status || 400).json({ error: friendlyError(error.message) });
  }
};

function friendlyError(message = "") {
  if (/already|registered|exists/i.test(message)) return "This email already has a login. Use a new email for now.";
  if (/fill|required|valid email|Password|Selected hotel|login again|Super admin/i.test(message)) return message;
  return "Team member could not be created. Please try again.";
}
