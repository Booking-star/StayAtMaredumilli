// payment-service.js - Isolated Payment Service for Stay@Maredumilli
// ponytail: this file contains only payment-related functions to isolate gateway and manual UPI code.

function setManualPaymentLinks(amount, roomObj) {
  const upiId = (paymentSettings.upiId || "").trim();
  const reference = `SM${Date.now().toString().slice(-8)}`;
  const params = new URLSearchParams({
    pa: upiId,
    pn: "StayAtMaredumilli",
    am: Number(amount || 0).toFixed(2),
    cu: "INR",
    tr: reference,
    tn: `${roomObj?.name || "Stay"} booking`
  });
  const disabled = !upiId || amount <= 0;
  const query = params.toString();
  const genericUrl = `upi://pay?${query}`;
  const phonePeUrl = `phonepe://pay?${query}`;
  
  [manualPhonePeLink, manualUpiLink].forEach(link => {
    if (!link) return;
    link.classList.toggle("disabled", disabled);
    link.setAttribute("aria-disabled", disabled ? "true" : "false");
    link.dataset.paymentUrl = disabled ? "" : genericUrl;
  });
  if (manualPhonePeLink) {
    manualPhonePeLink.dataset.paymentUrl = disabled ? "" : phonePeUrl;
  }
}

function openUpiPayment(event) {
  const link = event.target.closest("[data-payment-url]");
  if (!link) return;
  event.preventDefault();
  const url = link.dataset.paymentUrl;
  if (!url) {
    alert("UPI ID is not set yet. Please contact support.");
    return;
  }
  sessionStorage.setItem("stayUpiOpenedAt", String(Date.now()));
  const frame = document.createElement("iframe");
  frame.style.display = "none";
  frame.src = url;
  document.body.appendChild(frame);
  setTimeout(() => frame.remove(), 3000);
  setTimeout(() => {
    if (document.visibilityState === "visible") alert("If your payment app did not open, copy the UPI ID shown here and pay manually, then upload the screenshot.");
  }, 1800);
}

async function startRazorpayPayment(order, details, roomObj, pricing) {
  let paymentCompleted = false;
  const releaseHold = async () => {
    if (paymentCompleted) return true;
    const { data: sessionData } = await supabaseClient.auth.getSession();
    const response = await fetch("/api/release-payment-hold", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${sessionData.session?.access_token || ""}`
      },
      body: JSON.stringify({ hold_id: order.hold_id })
    }).catch(() => null);
    return Boolean(response?.ok);
  };
  return new Promise((resolve, reject) => {
    if (typeof Razorpay === "undefined") {
      return reject(new Error("Razorpay payment gateway failed to load. Please check your internet connection or disable ad-blockers, then refresh and try again."));
    }
    if (order.key_id?.startsWith("rzp_live_") && location.protocol !== "https:") {
      return reject(new Error("Razorpay live mode payments require a secure HTTPS connection. Please switch to Test Mode in your admin settings for local testing or deploy to Vercel."));
    }
    const checkout = new Razorpay({
      key: order.key_id,
      amount: order.amount * 100,
      currency: "INR",
      name: "Stay@Maredumilli",
      description: `${roomObj.name} booking`,
      order_id: order.order_id,
      prefill: {
        name: details.name || profile.name || "",
        email: details.email || profile.email || "",
        contact: details.phone || profile.phone || ""
      },
      notes: {
        hold_id: order.hold_id,
        room_id: roomObj.id
      },
      handler: async response => {
        paymentCompleted = true;
        try {
          submitBtn.textContent = "Payment received. Confirming room...";
          const { data: sessionData } = await supabaseClient.auth.getSession();
          const verify = await fetch("/api/verify-payment", {
            method: "POST",
            headers: {
              "content-type": "application/json",
              authorization: `Bearer ${sessionData.session?.access_token || ""}`
            },
            body: JSON.stringify({
              hold_id: order.hold_id,
              razorpay_order_id: response.razorpay_order_id,
              razorpay_payment_id: response.razorpay_payment_id,
              razorpay_signature: response.razorpay_signature
            })
          });
          const data = await verify.json().catch(() => ({}));
          if (!verify.ok) throw new Error(data.error || "Payment verification failed.");
          resolve(data);
        } catch (error) {
          try {
            submitBtn.textContent = "Payment received. Finalizing booking...";
            const recovered = await waitForPaymentConfirmation(order.hold_id, response.razorpay_payment_id);
            resolve(recovered);
          } catch {
            reject(error);
          }
        }
      },
      modal: {
        ondismiss: async () => {
          if (paymentCompleted) return;
          const released = await releaseHold();
          reject(new Error(released ? "Payment was not completed. Rooms were released." : "Payment was not completed. Please contact support if the room is still held."));
        }
      }
    });
    checkout.on?.("payment.failed", async () => {
      const released = await releaseHold();
      reject(new Error(released ? "Payment failed. Rooms were released." : "Payment failed. Please contact support if the room is still held."));
    });
    checkout.open();
  });
}

async function waitForPaymentConfirmation(holdId, paymentId) {
  for (let i = 0; i < 8; i++) {
    await new Promise(resolve => setTimeout(resolve, 1500));
    const { data: sessionData } = await supabaseClient.auth.getSession();
    const { response, data } = await fetchJsonWithTimeout(`/api/payment-status?hold_id=${encodeURIComponent(holdId)}&payment_id=${encodeURIComponent(paymentId)}`, {
      headers: { authorization: `Bearer ${sessionData.session?.access_token || ""}` }
    }, 5000);
    if (response.ok && data.booking_id) return data;
  }
  throw new Error("Payment verification failed.");
}

async function createMockBooking(roomObj, details, pricing, status = "confirmed", screenshotUrl = "") {
  if (!supabaseClient) return Date.now();
  if (!String(details.name || profile.name || "").trim()) throw new Error("Please enter your full name.");
  if (!String(details.email || profile.email || "").trim()) throw new Error("Please login again before booking.");
  const { data: sessionData } = await supabaseClient.auth.getSession();
  const { response, data: result } = await fetchJsonWithTimeout("/api/manual-booking", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${sessionData.session?.access_token || ""}`
    },
    body: JSON.stringify({
      p_room_id: roomObj.id,
      p_customer_name: details.name || profile.name,
      p_customer_phone: details.phone || profile.phone,
      p_customer_email: details.email || profile.email,
      p_check_in: details.from,
      p_check_out: details.to,
      p_num_rooms: details.rooms,
      p_num_adults: details.adults,
      p_num_kids: details.children,
      p_payment_option: details.payment,
      p_status: status,
      p_influencer_id: localStorage.getItem("influencer_id") || null,
      p_firecamp: details.firecamp,
      p_screenshot_url: screenshotUrl
    })
  }, 8000);
  if (!response.ok) throw new Error(result.error || "Booking could not be confirmed.");
  return result.id || Date.now();
}

async function attachManualScreenshotLater(bookingId, file) {
  if (!bookingId || !file || !supabaseClient) return;
  try {
    validateImageFile(file);
    const screenshotUrl = await fileToDataUrl(file);
    const { data: sessionData } = await supabaseClient.auth.getSession();
    await fetch("/api/manual-booking", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${sessionData.session?.access_token || ""}`
      },
      body: JSON.stringify({ p_attach_booking_id: bookingId, p_screenshot_url: screenshotUrl })
    });
  } catch (error) {
    console.warn("Payment screenshot sync failed:", error.message);
  }
}
