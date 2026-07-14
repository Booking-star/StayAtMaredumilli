const crypto = require("crypto");

function env() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Server is not configured.");
  return { url, key };
}

async function sb(path, options = {}) {
  const { url, key } = env();
  const response = await fetch(`${url}/rest/v1/${path}`, {
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
  if (!response.ok) throw new Error(data?.message || "Request failed.");
  return data;
}

async function userFromReq(req) {
  const token = String(req.headers.authorization || "").replace(/^Bearer\s+/i, "");
  if (!token) return null;
  const { url, key } = env();
  const response = await fetch(`${url}/auth/v1/user`, {
    signal: AbortSignal.timeout(10000),
    headers: { apikey: key, authorization: `Bearer ${token}` }
  });
  return response.ok ? response.json() : null;
}

async function createConfirmedUser({ email, password, name }) {
  const { url, key } = env();
  const response = await fetch(`${url}/auth/v1/admin/users`, {
    method: "POST",
    signal: AbortSignal.timeout(15000),
    headers: {
      apikey: key,
      authorization: `Bearer ${key}`,
      "content-type": "application/json"
    },
    body: JSON.stringify({
      email,
      password,
      email_confirm: true,
      user_metadata: { name }
    })
  });
  const data = await response.json().catch(() => null);
  if (!response.ok) throw new Error(data?.msg || data?.message || data?.error || "Team login could not be created.");
  const created = data?.user || data;
  if (!created?.id) throw new Error("Team login could not be created.");
  return created;
}

async function maybe(path, options, fallback = []) {
  try {
    return await sb(path, options);
  } catch (error) {
    if (/relation .* does not exist|column .* does not exist|schema cache/i.test(error.message)) return fallback;
    throw error;
  }
}

async function membershipsFor(user) {
  const [ownerRows, memberRows] = await Promise.all([
    maybe(`hotel_owners?id=eq.${encodeURIComponent(user.id)}&active=eq.true&select=id,hotel_name,owner_name`, {}, []),
    maybe(`hotel_members?user_id=eq.${encodeURIComponent(user.id)}&status=eq.active&select=hotel_id,role,hotel_owners(id,hotel_name,owner_name)`, {}, [])
  ]);
  const map = new Map();
  ownerRows.forEach(row => map.set(row.id, {
    hotel_id: row.id,
    role: "owner",
    hotel_name: row.hotel_name || row.owner_name || "Hotel",
    owner_name: row.owner_name || ""
  }));
  memberRows.forEach(row => {
    const hotel = Array.isArray(row.hotel_owners) ? row.hotel_owners[0] : row.hotel_owners;
    if (!row.hotel_id || map.has(row.hotel_id)) return;
    map.set(row.hotel_id, {
      hotel_id: row.hotel_id,
      role: row.role === "owner" ? "owner" : "member",
      hotel_name: hotel?.hotel_name || hotel?.owner_name || "Hotel",
      owner_name: hotel?.owner_name || ""
    });
  });
  return [...map.values()];
}

function pickMembership(memberships, hotelId) {
  if (!memberships.length) return null;
  if (hotelId) return memberships.find(m => String(m.hotel_id) === String(hotelId)) || memberships[0];
  return memberships[0];
}

async function loadContext(user, hotelId) {
  const memberships = await membershipsFor(user);
  const current = pickMembership(memberships, hotelId);
  if (!current) return { memberships, current: null, rooms: [], bookings: [], occupancy: [], members: [] };
  const rooms = await maybe(`rooms_with_owner_policy?owner_id=eq.${encodeURIComponent(current.hotel_id)}&active=eq.true&select=*`, {}, []);
  const roomIds = rooms.map(r => r.id);
  if (!roomIds.length) return { memberships, current, rooms, bookings: [], occupancy: [], members: await loadMembers(current) };
  const idFilter = roomIds.map(encodeURIComponent).join(",");
  let bookings = await maybe(`bookings?room_id=in.(${idFilter})&status=neq.cancelled&select=id,room_id,customer_name,customer_phone,check_in,check_out,num_rooms,num_adults,num_kids,total_price,owner_amount,status,payment_option,created_at,created_by,source&order=check_in.asc`, {}, null);
  if (!bookings) {
    bookings = await maybe(`bookings?room_id=in.(${idFilter})&status=neq.cancelled&select=id,room_id,customer_name,customer_phone,check_in,check_out,num_rooms,num_adults,num_kids,total_price,owner_amount,status,payment_option,created_at&order=check_in.asc`, {}, []);
  }
  const occupancy = await maybe(`booking_occupancy?room_id=in.(${idFilter})&select=room_id,check_in,check_out,num_rooms,status`, {}, bookings);
  return { memberships, current, rooms, bookings, occupancy, members: await loadMembers(current) };
}

async function loadMembers(current) {
  if (current.role !== "owner") return [];
  const rows = await maybe(`hotel_members?hotel_id=eq.${encodeURIComponent(current.hotel_id)}&status=eq.active&select=id,user_id,role,joined_at`, {}, []);
  return rows.map(row => ({
    id: row.id,
    user_id: row.user_id,
    role: row.role,
    joined_at: row.joined_at
  }));
}

async function requireAdmin(user) {
  const rows = await maybe(`profiles?id=eq.${encodeURIComponent(user.id)}&select=role&limit=1`, {}, []);
  const profile = rows?.[0];
  const allowed =
    user.email === "admin@stayatmaredumilli.com" ||
    user.email === "admin@staymaredumilli.com" ||
    profile?.role === "admin";
  if (!allowed) throw new Error("Super admin access only.");
}

function adminMemberInput(body = {}) {
  const name = String(body.name || "").trim();
  const email = String(body.email || "").trim().toLowerCase();
  const password = String(body.password || "");
  const hotelId = String(body.hotel_id || "").trim();
  const role = body.role === "owner" ? "owner" : "member";
  if (!name || !email || !password || !hotelId) throw new Error("Please fill all required team member details.");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error("Please enter a valid email address.");
  if (password.length < 6) throw new Error("Password must be at least 6 characters.");
  return { name, email, password, hotelId, role };
}

async function adminCreateMember(user, body) {
  await requireAdmin(user);
  const input = adminMemberInput(body);
  const hotelRows = await sb(`hotel_owners?id=eq.${encodeURIComponent(input.hotelId)}&active=eq.true&select=id&limit=1`);
  if (!hotelRows?.[0]) throw new Error("Selected hotel is not available.");
  const created = await createConfirmedUser(input);
  await sb("profiles?on_conflict=id", {
    method: "POST",
    headers: { prefer: "resolution=merge-duplicates,return=minimal" },
    body: JSON.stringify({ id: created.id, role: "owner" })
  });
  await sb("hotel_members?on_conflict=hotel_id,user_id", {
    method: "POST",
    headers: { prefer: "resolution=merge-duplicates,return=minimal" },
    body: JSON.stringify({
      hotel_id: input.hotelId,
      user_id: created.id,
      role: input.role,
      status: "active",
      joined_at: new Date().toISOString()
    })
  });
  return { user_id: created.id };
}

async function requireMembership(user, hotelId) {
  const current = pickMembership(await membershipsFor(user), hotelId);
  if (!current) throw new Error("Access denied.");
  return current;
}

async function generateInvite(user, hotelId) {
  const current = await requireMembership(user, hotelId);
  if (current.role !== "owner") throw new Error("Only the owner can invite team members.");
  const code = String(crypto.randomInt(0, 1000000)).padStart(6, "0");
  await sb("invite_codes", {
    method: "POST",
    headers: { prefer: "return=minimal" },
    body: JSON.stringify({
      hotel_id: current.hotel_id,
      code,
      created_by: user.id,
      expires_at: new Date(Date.now() + 15 * 60 * 1000).toISOString()
    })
  });
  return { code, expires_at: new Date(Date.now() + 15 * 60 * 1000).toISOString() };
}

async function redeemInvite(user, code) {
  const rows = await sb(`invite_codes?code=eq.${encodeURIComponent(code)}&used_at=is.null&expires_at=gt.${encodeURIComponent(new Date().toISOString())}&select=id,hotel_id`);
  const invite = rows?.[0];
  if (!invite) throw new Error("Invite code is expired or already used.");
  await sb("hotel_members", {
    method: "POST",
    headers: { prefer: "resolution=merge-duplicates,return=minimal" },
    body: JSON.stringify({
      hotel_id: invite.hotel_id,
      user_id: user.id,
      role: "member",
      status: "active",
      joined_at: new Date().toISOString()
    })
  });
  await sb(`invite_codes?id=eq.${encodeURIComponent(invite.id)}&used_at=is.null`, {
    method: "PATCH",
    headers: { prefer: "return=minimal" },
    body: JSON.stringify({ used_at: new Date().toISOString(), used_by: user.id })
  });
  return { hotel_id: invite.hotel_id };
}

async function createBlock(user, body) {
  const current = await requireMembership(user, body.hotel_id);
  const rooms = await sb(`rooms?id=eq.${encodeURIComponent(body.room_id)}&owner_id=eq.${encodeURIComponent(current.hotel_id)}&active=eq.true&select=id`);
  if (!rooms?.[0]) throw new Error("Room is not available.");
  const bookingId = await sb("rpc/create_booking_safe", {
    method: "POST",
    body: JSON.stringify({
      p_room_id: body.room_id,
      p_customer_name: body.customer_name || "Offline Walk-in",
      p_customer_phone: body.customer_phone || "N/A",
      p_customer_email: null,
      p_check_in: body.check_in,
      p_check_out: body.check_out,
      p_num_rooms: Number(body.num_rooms || 1),
      p_num_adults: 1,
      p_num_kids: 0,
      p_payment_option: "offline",
      p_status: "offline_blocked",
      p_influencer_id: null,
      p_firecamp: false
    })
  });
  await maybe(`bookings?id=eq.${encodeURIComponent(bookingId)}`, {
    method: "PATCH",
    headers: { prefer: "return=minimal" },
    body: JSON.stringify({ created_by: user.id, source: "offline" })
  }, null);
  return { booking_id: bookingId };
}

async function releaseBlock(user, body) {
  const current = await requireMembership(user, body.hotel_id);
  let rows = await maybe(`bookings?id=eq.${encodeURIComponent(body.booking_id)}&select=id,room_id,status,created_by`, {}, null);
  if (!rows) rows = await maybe(`bookings?id=eq.${encodeURIComponent(body.booking_id)}&select=id,room_id,status`, {}, []);
  const booking = rows?.[0];
  if (!booking || booking.status !== "offline_blocked") throw new Error("Only offline blocks can be released.");
  const rooms = await sb(`rooms?id=eq.${encodeURIComponent(booking.room_id)}&owner_id=eq.${encodeURIComponent(current.hotel_id)}&select=id`);
  if (!rooms?.[0]) throw new Error("Access denied.");
  if (current.role !== "owner" && String(booking.created_by || "") !== String(user.id)) {
    throw new Error("Only the creator or owner can release this block.");
  }
  await sb(`bookings?id=eq.${encodeURIComponent(booking.id)}&status=eq.offline_blocked`, {
    method: "PATCH",
    headers: { prefer: "return=minimal" },
    body: JSON.stringify({ status: "cancelled" })
  });
  return { ok: true };
}

module.exports = async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  try {
    const user = await userFromReq(req);
    if (!user?.id) return res.status(401).json({ error: "Please login again." });
    const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : req.body || {};
    const action = body.action || "context";
    const data =
      action === "context" ? await loadContext(user, body.hotel_id) :
      action === "generateInvite" ? await generateInvite(user, body.hotel_id) :
      action === "redeemInvite" ? await redeemInvite(user, String(body.code || "").trim()) :
      action === "adminCreateMember" ? await adminCreateMember(user, body) :
      action === "createBlock" ? await createBlock(user, body) :
      action === "releaseBlock" ? await releaseBlock(user, body) :
      null;
    if (!data) return res.status(400).json({ error: "Unknown action." });
    return res.status(200).json(data);
  } catch (error) {
    console.error("Owner team action failed:", error.message);
    return res.status(400).json({ error: ownerError(error.message) });
  }
};

function ownerError(message = "") {
  if (/already|registered|exists/i.test(message)) return "This email already has a login. Use a new email for now.";
  if (/expired|already used|Only the owner|Only the creator|Room is not available|Super admin|fill all|required|valid email|Password|Selected hotel/i.test(message)) return message;
  return "Operation failed. Please try again or contact support.";
}
