const defaultPricingSettings = {
  occupancy80Surcharge: 200,
  occupancy90Surcharge: 300
};

function getStoredPricingSettings() {
  try {
    return JSON.parse(localStorage.getItem("stayPricingSettings")) || defaultPricingSettings;
  } catch {
    return defaultPricingSettings;
  }
}

function normalizePricingSettings(settings = {}) {
  return {
    occupancy80Surcharge: Math.max(0, Number(settings.occupancy80Surcharge ?? defaultPricingSettings.occupancy80Surcharge) || 0),
    occupancy90Surcharge: Math.max(0, Number(settings.occupancy90Surcharge ?? defaultPricingSettings.occupancy90Surcharge) || 0)
  };
}

function fillPricingForm(settings) {
  const normalized = normalizePricingSettings(settings);
  if (pricing80Surcharge) pricing80Surcharge.value = normalized.occupancy80Surcharge;
  if (pricing90Surcharge) pricing90Surcharge.value = normalized.occupancy90Surcharge;
}

function fillPaymentForm(settings) {
  if (paymentMode) paymentMode.value = ["manual", "mock", "razorpay"].includes(settings?.mode) ? settings.mode : "manual";
  if (paymentUpiId) paymentUpiId.value = settings?.upiId || "";
}

async function loadPricingSettings() {
  fillPricingForm(getStoredPricingSettings());
  const textInput = document.querySelector("#announcementText");
  const activeInput = document.querySelector("#announcementActive");
  if (textInput) textInput.value = "";
  if (activeInput) activeInput.checked = false;

  if (!supabaseClient) return;
  try {
    const { data, error } = await withTimeout(supabaseClient
      .from("site_settings")
      .select("value")
      .eq("key", "dynamic_pricing")
      .maybeSingle(), "Dynamic pricing settings are taking too long to load.");
    if (error) {
      notifyAdmin("Dynamic pricing settings are not available right now.", true);
      return;
    }
    const settings = normalizePricingSettings(data?.value);
    localStorage.setItem("stayPricingSettings", JSON.stringify(settings));
    fillPricingForm(settings);

    const { data: paymentData, error: paymentError } = await withTimeout(supabaseClient
      .from("site_settings")
      .select("value")
      .eq("key", "payment")
      .maybeSingle(), "Payment settings are taking too long to load.");
    if (paymentError) {
      notifyAdmin("Payment settings are not available right now.", true);
      return;
    }
    fillPaymentForm(paymentData?.value || { mode: "mock" });

    // Load Announcement Settings
    const { data: announcementData, error: announcementError } = await withTimeout(supabaseClient
      .from("site_settings")
      .select("value")
      .eq("key", "announcement")
      .maybeSingle(), "Announcement settings are taking too long to load.");
    if (!announcementError && announcementData?.value) {
      if (textInput) textInput.value = announcementData.value.text || "";
      if (activeInput) activeInput.checked = !!announcementData.value.active;
    }
  } catch (error) {
    notifyAdmin(error.message || "Admin settings are taking too long to load.", true);
  }
}

async function saveAnnouncementSettings(event) {
  event.preventDefault();
  const textInput = document.querySelector("#announcementText");
  const activeInput = document.querySelector("#announcementActive");
  const value = {
    text: textInput?.value?.trim() || "",
    active: !!activeInput?.checked
  };
  if (!supabaseClient) {
    notifyAdmin("Connection is not ready. Announcement was not saved.", true);
    return;
  }
  const { error } = await withTimeout(supabaseClient
    .from("site_settings")
    .upsert({ key: "announcement", value, updated_at: new Date().toISOString() }), "Announcement save is taking too long. Please try again.");
  if (error) return notifyAdmin("Announcement settings could not be saved.", true);
  notifyAdmin("Announcement settings saved successfully.");
}

async function savePricingSettings(event) {
  event.preventDefault();
  const settings = normalizePricingSettings({
    occupancy80Surcharge: pricing80Surcharge?.value,
    occupancy90Surcharge: pricing90Surcharge?.value
  });
  localStorage.setItem("stayPricingSettings", JSON.stringify(settings));
  if (!supabaseClient) {
    setStatus("Saved pricing settings locally.");
    return;
  }
  const { error } = await withTimeout(supabaseClient
    .from("site_settings")
    .upsert({ key: "dynamic_pricing", value: settings, updated_at: new Date().toISOString() }), "Dynamic pricing save is taking too long. Please try again.");
  if (error) return notifyAdmin("Dynamic pricing settings could not be saved.", true);
  notifyAdmin("Dynamic pricing settings saved.");
}

async function savePaymentSettings(event) {
  event.preventDefault();
  if (!supabaseClient) return notifyAdmin("Connection is not ready. Payment mode was not saved.", true);
  const value = { mode: paymentMode.value, upiId: paymentUpiId?.value?.trim() || "" };
  if (value.mode === "manual" && !value.upiId) return notifyAdmin("Enter UPI ID before saving manual payment mode.", true);
  const button = adminPaymentForm.querySelector("button[type='submit']");
  const resetButton = () => {
    if (button) {
      button.disabled = false;
      button.textContent = "Save Payment Mode";
    }
  };
  if (button) {
    button.disabled = true;
    button.textContent = "Saving...";
  }
  try {
    const { data: sessionData } = await supabaseClient.auth.getSession();
    const response = await withTimeout(fetch("/api/payment-settings", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${sessionData.session?.access_token || ""}`
      },
      body: JSON.stringify(value)
    }));
    const saved = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(saved.error || "Payment settings were not saved.");
    fillPaymentForm(saved);
    resetButton();
    notifyAdmin(`Payment settings saved. Mode: ${value.mode}${value.upiId ? `, UPI: ${value.upiId}` : ""}.`);
  } catch (error) {
    resetButton();
    notifyAdmin("Payment mode could not be saved. Please try again.", true);
  } finally {
    resetButton();
  }
}
