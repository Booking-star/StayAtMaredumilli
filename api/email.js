const tls = require("tls");

const SUPPORT_EMAIL = "stayatmaredumilli@gmail.com";
const BOOKING_EMAIL = "stayatmaredumilli@gmail.com";
const SUPPORT_PHONE = "+91 93924 39935";
const WEBSITE_URL = "https://stayatmaredumilli.com";

function smtpConfigured() {
  return Boolean(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS);
}

function headerAddress(name, email) {
  return `"${String(name || "").replace(/["\\]/g, "")}" <${email}>`;
}

function escapeHtml(value) {
  return String(value || "").replace(/[&<>"']/g, char => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "\"": "&quot;",
    "'": "&#39;"
  }[char]));
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

async function sendMail({ to, subject, text, html }) {
  if (!to) return;

  if (process.env.BREVO_API_KEY) {
    const senderEmail = process.env.SMTP_FROM || SUPPORT_EMAIL;
    const recipients = Array.isArray(to) ? to.filter(Boolean) : [to];
    for (const recipient of recipients) {
      const response = await fetch("https://api.brevo.com/v3/smtp/email", {
        method: "POST",
        headers: {
          "accept": "application/json",
          "api-key": process.env.BREVO_API_KEY,
          "content-type": "application/json"
        },
        body: JSON.stringify({
          sender: {
            name: "Stay@Maredumilli",
            email: senderEmail
          },
          to: [{ email: recipient }],
          subject: subject,
          textContent: text,
          htmlContent: html
        })
      });
      const data = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(`Brevo API rejected email: ${JSON.stringify(data)}`);
      }
    }
    return;
  }

  if (!smtpConfigured()) return;
  const host = process.env.SMTP_HOST;
  const port = Number(process.env.SMTP_PORT || 465);
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  const senderEmail = process.env.SMTP_FROM || (user.includes("@") ? user : SUPPORT_EMAIL);
  const recipients = Array.isArray(to) ? to.filter(Boolean) : [to];
  const body = String(text || "").replace(/\r?\n\./g, "\n..");
  const htmlBody = html ? String(html).replace(/\r?\n\./g, "\n..") : "";

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
      await smtpCommand(socket, `MAIL FROM:<${senderEmail}>`, [250]);
      await smtpCommand(socket, `RCPT TO:<${recipient}>`, [250, 251]);
      await smtpCommand(socket, "DATA", [354]);
      const messageIdDomain = String(senderEmail).split("@")[1] || "stayatmaredumilli.com";
      const messageId = `<${Date.now()}.${Math.random().toString(16).slice(2)}@${messageIdDomain}>`;
      const boundary = `stay-${Date.now()}-${Math.random().toString(16).slice(2)}`;
      const headers = [
        `From: ${headerAddress("Stay@Maredumilli", senderEmail)}`,
        `To: ${recipient}`,
        `Reply-To: ${SUPPORT_EMAIL}`,
        `Subject: ${subject}`,
        `Date: ${new Date().toUTCString()}`,
        `Message-ID: ${messageId}`,
        "MIME-Version: 1.0",
        htmlBody
          ? `Content-Type: multipart/alternative; boundary="${boundary}"`
          : "Content-Type: text/plain; charset=UTF-8",
        htmlBody ? "" : "Content-Transfer-Encoding: 8bit",
      ].filter(line => line !== "");
      const message = htmlBody ? [
        ...headers,
        "",
        `--${boundary}`,
        "Content-Type: text/plain; charset=UTF-8",
        "Content-Transfer-Encoding: 8bit",
        "",
        body,
        `--${boundary}`,
        "Content-Type: text/html; charset=UTF-8",
        "Content-Transfer-Encoding: 8bit",
        "",
        htmlBody,
        `--${boundary}--`,
        "."
      ] : [
        ...headers,
        "",
        body,
        "."
      ];
      socket.write(message.join("\r\n") + "\r\n");
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

async function roomDetails(roomId) {
  if (!roomId) return { hotelName: "Booked stay", roomType: "", ownerName: "Not assigned" };
  const privateRows = await supabaseFetch(
    `rooms_with_owner_policy?id=eq.${encodeURIComponent(roomId)}&select=*&limit=1`
  ).catch(() => []);
  const publicRows = privateRows?.length ? [] : await supabaseFetch(
    `rooms_public?id=eq.${encodeURIComponent(roomId)}&select=*&limit=1`
  ).catch(() => []);
  const room = privateRows?.[0] || publicRows?.[0] || {};
  return {
    hotelName: room.hotel_name || room.room_name || "Booked stay",
    roomType: room.room_type || "",
    ownerName: room.owner_name || "Not assigned",
    mapLink: room.map_link || ""
  };
}

async function markBookingEmailSent(bookingId) {
  if (!bookingId) return;
  await supabaseFetch(`bookings?id=eq.${encodeURIComponent(bookingId)}`, {
    method: "PATCH",
    headers: { Prefer: "return=minimal" },
    body: JSON.stringify({ confirmation_email_sent_at: new Date().toISOString() })
  }).catch(error => console.warn("Booking email marker update failed:", error.message));
}

function customerEmailText({ bookingId, hold, paymentId, room }) {
  const balance = Math.max(Number(hold.total_price || 0) - Number(hold.payable_amount || 0), 0);
  return [
    `Hi ${hold.customer_name || "Guest"},`,
    "",
    "Your Stay@Maredumilli booking is confirmed.",
    "",
    "Stay Details",
    `Check-in: ${hold.check_in}`,
    `Check-out: ${hold.check_out}`,
    `Rooms booked: ${hold.num_rooms || 1}`,
    `Hotel name: ${room.hotelName}`,
    `Guests: ${hold.num_adults || 0} adult(s), ${hold.num_kids || 0} kid(s)`,
    room.mapLink ? `Location: ${room.mapLink}` : "",
    "",
    "Payment Details",
    `Booking Ref: ${bookingRef(bookingId)}`,
    `Total amount: ${rupees(hold.total_price)}`,
    `Paid now: ${rupees(hold.payable_amount)}`,
    `Balance to be paid during check-in: ${rupees(balance)}`,
    paymentId ? `Payment ID: ${paymentId}` : "",
    "",
    "Check-in Note",
    "Please show this booking confirmation during check-in.",
    "No cancellations and no refunds.",
    `Website: ${WEBSITE_URL}`,
    "",
    `Support WhatsApp: ${SUPPORT_PHONE}`,
    `Support Email: ${SUPPORT_EMAIL}`,
    "",
    "Welcome to Maredumilli."
  ].filter(Boolean).join("\n");
}

function adminEmailText({ bookingId, hold, paymentId, room }) {
  const balance = Math.max(Number(hold.total_price || 0) - Number(hold.payable_amount || 0), 0);
  return [
    "New confirmed booking on Stay@Maredumilli.",
    "",
    "Booking Summary",
    `Check-in: ${hold.check_in}`,
    `Check-out: ${hold.check_out}`,
    `Rooms booked: ${hold.num_rooms || 1}`,
    `Hotel name: ${room.hotelName}`,
    `Hotel owner name: ${room.ownerName}`,
    "",
    "Guest Details",
    `Customer: ${hold.customer_name || ""}`,
    `Phone: ${hold.customer_phone || ""}`,
    `Email: ${hold.customer_email || ""}`,
    `Guests: ${hold.num_adults || 0} adult(s), ${hold.num_kids || 0} kid(s)`,
    `Booking Ref: ${bookingRef(bookingId)}`,
    paymentId ? `Payment ID: ${paymentId}` : "",
    "",
    "Payment Details",
    `Total: ${rupees(hold.total_price)}`,
    `Advance paid: ${rupees(hold.payable_amount)}`,
    `Balance to be paid during check-in: ${rupees(balance)}`,
    "",
    "Important",
    "No cancellations and no refunds.",
    `Website: ${WEBSITE_URL}`,
    `Support: ${SUPPORT_PHONE} | ${SUPPORT_EMAIL}`
  ].filter(Boolean).join("\n");
}

function detailTable(rows) {
  return `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse;border:1px solid #ece7dd;border-radius:10px;overflow:hidden;margin-bottom:16px;">
    ${rows.map(([label, value], index) => `
      <tr style="background:${index % 2 ? "#ffffff" : "#fbfaf7"};">
        <td style="padding:12px 14px;border-bottom:1px solid #ece7dd;color:#65717c;font-size:13px;width:38%;">${escapeHtml(label)}</td>
        <td style="padding:12px 14px;border-bottom:1px solid #ece7dd;font-size:14px;font-weight:600;">${escapeHtml(value)}</td>
      </tr>`).join("")}
  </table>`;
}

function bookingEmailHtml({ title, intro, bookingId, hold, paymentId, room, admin = false }) {
  const balance = Math.max(Number(hold.total_price || 0) - Number(hold.payable_amount || 0), 0);
  const sections = admin ? [
    ["Booking Summary", [
      ["Check-in", hold.check_in],
      ["Check-out", hold.check_out],
      ["Rooms booked", hold.num_rooms || 1],
      ["Hotel name", room.hotelName],
      ["Hotel owner name", room.ownerName]
    ]],
    ["Guest Details", [
      ["Customer", hold.customer_name || ""],
      ["Phone", hold.customer_phone || ""],
      ["Email", hold.customer_email || ""],
      ["Guests", `${hold.num_adults || 0} adult(s), ${hold.num_kids || 0} kid(s)`],
      ["Booking Ref", bookingRef(bookingId)],
      paymentId ? ["Payment ID", paymentId] : null
    ].filter(Boolean)],
    ["Payment Details", [
      ["Total", rupees(hold.total_price)],
      ["Paid now", rupees(hold.payable_amount)],
      ["Balance to be paid during check-in", rupees(balance)]
    ]]
  ] : [
    ["Stay Details", [
      ["Check-in", hold.check_in],
      ["Check-out", hold.check_out],
      ["Rooms booked", hold.num_rooms || 1],
      ["Hotel name", room.hotelName],
      ["Room type", room.roomType || "Room"],
      ["Guests", `${hold.num_adults || 0} adult(s), ${hold.num_kids || 0} kid(s)`],
      room.mapLink ? ["Location", room.mapLink] : null
    ].filter(Boolean)],
    ["Payment Details", [
      ["Booking Ref", bookingRef(bookingId)],
      ["Total amount", rupees(hold.total_price)],
      ["Paid now", rupees(hold.payable_amount)],
      ["Balance to be paid during check-in", rupees(balance)],
      paymentId ? ["Payment ID", paymentId] : null
    ].filter(Boolean)]
  ];
  return `<!doctype html>
<html>
  <body style="margin:0;background:#f5f3ee;font-family:Arial,Helvetica,sans-serif;color:#1f2933;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f5f3ee;padding:24px 12px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:620px;background:#ffffff;border:1px solid #e5e0d6;border-radius:14px;overflow:hidden;">
            <tr>
              <td style="background:#164e3b;color:#ffffff;padding:24px;">
                <div style="font-size:13px;letter-spacing:.08em;text-transform:uppercase;opacity:.82;">Stay@Maredumilli</div>
                <h1 style="margin:8px 0 0;font-size:24px;line-height:1.25;">${escapeHtml(title)}</h1>
              </td>
            </tr>
            <tr>
              <td style="padding:24px;">
                <p style="margin:0 0 18px;font-size:16px;line-height:1.55;">${escapeHtml(intro)}</p>
                ${sections.map(([heading, rows]) => `
                  <h2 style="margin:18px 0 8px;font-size:16px;color:#1f2933;">${escapeHtml(heading)}</h2>
                  ${detailTable(rows)}
                `).join("")}
                <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin-top:18px;background:#fbfaf7;border:1px solid #ece7dd;border-radius:10px;">
                  <tr>
                    <td style="padding:14px;color:#65717c;font-size:13px;line-height:1.6;">
                      <strong style="color:#1f2933;">${admin ? "Important" : "Check-in Note"}</strong><br>
                      ${admin ? "" : "Please show this booking confirmation during check-in.<br>"}
                      No cancellations and no refunds.<br>
                      Website: <a href="${WEBSITE_URL}" style="color:#164e3b;text-decoration:none;">${WEBSITE_URL}</a><br>
                      Support: ${escapeHtml(SUPPORT_PHONE)} | ${escapeHtml(SUPPORT_EMAIL)}
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

async function sendBookingEmailsOnce({ bookingId, hold, paymentId }) {
  if (!smtpConfigured()) {
    console.warn("Booking email skipped: SMTP is not configured.");
    return;
  }
  if (!hold) return;
  const claimed = await claimBookingEmail(bookingId);
  if (!claimed) return;
  const room = await roomDetails(hold.room_id);
  const adminRecipients = [process.env.SMTP_USER || BOOKING_EMAIL];
  const subject = `Booking confirmed - ${bookingRef(bookingId)}`;
  const results = await Promise.allSettled([
    sendMail({
      to: hold.customer_email,
      subject,
      text: customerEmailText({ bookingId, hold, paymentId, room }),
      html: bookingEmailHtml({
        title: "Booking Confirmed",
        intro: `Hi ${hold.customer_name || "Guest"}, your Stay@Maredumilli booking is confirmed.`,
        bookingId,
        hold,
        paymentId,
        room
      })
    }),
    sendMail({
      to: adminRecipients,
      subject: `New booking - ${bookingRef(bookingId)}`,
      text: adminEmailText({ bookingId, hold, paymentId, room }),
      html: bookingEmailHtml({
        title: "New Confirmed Booking",
        intro: "A new booking has been confirmed on Stay@Maredumilli.",
        bookingId,
        hold,
        paymentId,
        room,
        admin: true
      })
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
