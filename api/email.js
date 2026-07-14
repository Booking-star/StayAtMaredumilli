const tls = require("tls");

const SUPPORT_EMAIL = "stayatmaredumilli@gmail.com";
const BOOKING_EMAIL = "stayatmaredumilli@gmail.com";
const SUPPORT_PHONE = "+91 93924 39935";

function smtpConfigured() {
  return Boolean(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS);
}

function headerAddress(name, email) {
  return `"${String(name || "").replace(/["\\]/g, "")}" <${email}>`;
}

function rupees(value) {
  return `Rs.${Number(value || 0).toLocaleString("en-IN")}`;
}

function bookingRef(id) {
  return `SM-${String(id || "").replace(/-/g, "").slice(0, 8).toUpperCase() || "BOOKING"}`;
}

function smtpRead(socket) {
  return new Promise((resolve, reject) => {
    let buffer = "";
    const timer = setTimeout(() => {
      cleanup();
      reject(new Error("SMTP timed out."));
    }, 15000);
    const cleanup = () => {
      clearTimeout(timer);
      socket.off("data", onData);
      socket.off("error", onError);
    };
    const onError = error => {
      cleanup();
      reject(error);
    };
    const onData = chunk => {
      buffer += chunk.toString("utf8");
      const lines = buffer.split(/\r?\n/).filter(Boolean);
      const last = lines[lines.length - 1] || "";
      if (/^\d{3} /.test(last)) {
        cleanup();
        resolve({ code: Number(last.slice(0, 3)), text: buffer });
      }
    };
    socket.on("data", onData);
    socket.on("error", onError);
  });
}

async function smtpCommand(socket, command, expectedCodes) {
  if (command) socket.write(`${command}\r\n`);
  const response = await smtpRead(socket);
  if (!expectedCodes.includes(response.code)) {
    throw new Error(`SMTP rejected command: ${response.code}`);
  }
  return response;
}

async function sendMail({ to, subject, text }) {
  if (!smtpConfigured() || !to) return;
  const host = process.env.SMTP_HOST;
  const port = Number(process.env.SMTP_PORT || 465);
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  const recipients = Array.isArray(to) ? to.filter(Boolean) : [to];
  const body = String(text || "").replace(/\r?\n\./g, "\n..");

  for (const recipient of recipients) {
    const socket = tls.connect({ host, port, servername: host });
    await new Promise((resolve, reject) => {
      socket.once("secureConnect", resolve);
      socket.once("error", reject);
    });
    try {
      await smtpCommand(socket, null, [220]);
      await smtpCommand(socket, "EHLO stayatmaredumilli.com", [250]);
      await smtpCommand(socket, "AUTH LOGIN", [334]);
      await smtpCommand(socket, Buffer.from(user).toString("base64"), [334]);
      await smtpCommand(socket, Buffer.from(pass).toString("base64"), [235]);
      await smtpCommand(socket, `MAIL FROM:<${user}>`, [250]);
      await smtpCommand(socket, `RCPT TO:<${recipient}>`, [250, 251]);
      await smtpCommand(socket, "DATA", [354]);
      const messageIdDomain = String(user).split("@")[1] || "stayatmaredumilli.com";
      const messageId = `<${Date.now()}.${Math.random().toString(16).slice(2)}@${messageIdDomain}>`;
      socket.write([
        `From: ${headerAddress("Stay@Maredumilli", user)}`,
        `To: ${recipient}`,
        `Reply-To: ${SUPPORT_EMAIL}`,
        `Subject: ${subject}`,
        `Date: ${new Date().toUTCString()}`,
        `Message-ID: ${messageId}`,
        "MIME-Version: 1.0",
        "Content-Type: text/plain; charset=UTF-8",
        "Content-Transfer-Encoding: 8bit",
        "",
        body,
        "."
      ].join("\r\n") + "\r\n");
      await smtpCommand(socket, null, [250]);
      await smtpCommand(socket, "QUIT", [221]);
    } finally {
      socket.end();
    }
  }
}

async function supabaseFetch(path, options = {}) {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Supabase service credentials are not configured.");
  const response = await fetch(`${url}/rest/v1/${path}`, {
    ...options,
    headers: {
      apikey: key,
      authorization: `Bearer ${key}`,
      "content-type": "application/json",
      ...(options.headers || {})
    }
  });
  const data = await response.json().catch(() => null);
  if (!response.ok) {
    const error = new Error(data?.message || "Database request failed.");
    error.details = data;
    throw error;
  }
  return data;
}

async function claimBookingEmail(bookingId) {
  if (!bookingId) return true;
  try {
    const rows = await supabaseFetch(
      `bookings?id=eq.${encodeURIComponent(bookingId)}&confirmation_email_sent_at=is.null&select=id`,
      {
        method: "GET",
        headers: { Prefer: "return=representation" },
      }
    );
    return Array.isArray(rows) && rows.length > 0;
  } catch (error) {
    if (/confirmation_email_sent_at|column/i.test(error.message || "")) {
      console.warn("Booking email marker column is missing; sending without duplicate guard.");
      return true;
    }
    throw error;
  }
}

async function roomSummary(roomId) {
  if (!roomId) return "Booked room";
  const rows = await supabaseFetch(
    `rooms_public?id=eq.${encodeURIComponent(roomId)}&select=room_name,room_type&limit=1`
  ).catch(() => []);
  const room = rows?.[0];
  return [room?.room_name, room?.room_type].filter(Boolean).join(" - ") || "Booked room";
}

async function markBookingEmailSent(bookingId) {
  if (!bookingId) return;
  await supabaseFetch(`bookings?id=eq.${encodeURIComponent(bookingId)}`, {
    method: "PATCH",
    headers: { Prefer: "return=minimal" },
    body: JSON.stringify({ confirmation_email_sent_at: new Date().toISOString() })
  }).catch(error => console.warn("Booking email marker update failed:", error.message));
}

function customerEmailText({ bookingId, hold, paymentId, roomLabel }) {
  const balance = Math.max(Number(hold.total_price || 0) - Number(hold.payable_amount || 0), 0);
  return [
    `Hi ${hold.customer_name || "Guest"},`,
    "",
    "Your Stay@Maredumilli booking is confirmed.",
    "",
    `Booking Ref: ${bookingRef(bookingId)}`,
    `Room: ${roomLabel}`,
    `Dates: ${hold.check_in} to ${hold.check_out}`,
    `Guests: ${hold.num_adults || 0} adult(s), ${hold.num_kids || 0} kid(s)`,
    `Rooms: ${hold.num_rooms || 1}`,
    `Total: ${rupees(hold.total_price)}`,
    `Paid now: ${rupees(hold.payable_amount)}`,
    `Balance at stay: ${rupees(balance)}`,
    paymentId ? `Payment ID: ${paymentId}` : "",
    "",
    "No cancellations and no refunds. Please keep this email for check-in support.",
    "",
    `Support WhatsApp: ${SUPPORT_PHONE}`,
    `Support Email: ${SUPPORT_EMAIL}`,
    "",
    "Welcome to Maredumilli."
  ].filter(Boolean).join("\n");
}

function adminEmailText({ bookingId, hold, paymentId, roomLabel }) {
  const balance = Math.max(Number(hold.total_price || 0) - Number(hold.payable_amount || 0), 0);
  return [
    "New confirmed booking on Stay@Maredumilli.",
    "",
    `Booking Ref: ${bookingRef(bookingId)}`,
    `Booking ID: ${bookingId || ""}`,
    `Room: ${roomLabel}`,
    `Dates: ${hold.check_in} to ${hold.check_out}`,
    `Rooms: ${hold.num_rooms || 1}`,
    `Adults/Kids: ${hold.num_adults || 0}/${hold.num_kids || 0}`,
    "",
    `Customer: ${hold.customer_name || ""}`,
    `Phone: ${hold.customer_phone || ""}`,
    `Email: ${hold.customer_email || ""}`,
    "",
    `Total: ${rupees(hold.total_price)}`,
    `Advance paid: ${rupees(hold.payable_amount)}`,
    `Balance: ${rupees(balance)}`,
    paymentId ? `Payment ID: ${paymentId}` : ""
  ].filter(Boolean).join("\n");
}

async function sendBookingEmailsOnce({ bookingId, hold, paymentId }) {
  if (!smtpConfigured()) {
    console.warn("Booking email skipped: SMTP is not configured.");
    return;
  }
  if (!hold) return;
  const claimed = await claimBookingEmail(bookingId);
  if (!claimed) return;
  const roomLabel = await roomSummary(hold.room_id);
  const adminEmail = process.env.ADMIN_EMAIL || process.env.SMTP_USER || BOOKING_EMAIL;
  const subject = `Booking confirmed - ${bookingRef(bookingId)}`;
  const results = await Promise.allSettled([
    sendMail({
      to: hold.customer_email,
      subject,
      text: customerEmailText({ bookingId, hold, paymentId, roomLabel })
    }),
    sendMail({
      to: adminEmail,
      subject: `New booking - ${bookingRef(bookingId)}`,
      text: adminEmailText({ bookingId, hold, paymentId, roomLabel })
    })
  ]);
  results.forEach((result, index) => {
    if (result.status === "rejected") {
      console.error(`${index ? "Admin" : "Customer"} booking email failed:`, result.reason?.message || result.reason);
    }
  });
  if (results.some(result => result.status === "fulfilled")) {
    await markBookingEmailSent(bookingId);
    console.log("Booking email sent:", bookingRef(bookingId));
  }
}

module.exports = { sendBookingEmailsOnce };
