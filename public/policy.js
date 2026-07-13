const POLICY_LABELS = {
  "terms-of-service": "Terms of Service",
  "cancellation-policy": "Cancellation Policy",
  "check-in-policy": "Check-in Policy"
};
const LANG_LABELS = { en: "English", te: "Telugu", hi: "Hindi" };
const LANG_ATTR = { en: "en", te: "te", hi: "hi" };

const slug = location.pathname.split("/").filter(Boolean).pop() || "terms-of-service";
const policyName = POLICY_LABELS[slug] || POLICY_LABELS["terms-of-service"];
const languageSelect = document.querySelector("#policyLanguage");
const content = document.querySelector("#policyContent");
const NO_REFUND_NOTICE = {
  en: "No cancellations and no refunds. Once payment is made, the booking amount is not refundable for any reason.",
  te: "రద్దులు మరియు రీఫండ్లు లేవు. చెల్లింపు చేసిన తర్వాత, ఏ కారణం చేతనైనా బుకింగ్ మొత్తం తిరిగి చెల్లించబడదు.",
  hi: "कोई कैंसलेशन और कोई रिफंड नहीं। भुगतान होने के बाद किसी भी कारण से बुकिंग राशि वापस नहीं की जाएगी।"
};
const CONTACT_MARKDOWN = `## Contact Us
For room bookings, travel packages, payment support, cancellations, or general enquiries, please contact us:

**StayAtMaredumilli**

WhatsApp: +91 93924 39935
Email: stayatmaredumilli@gmail.com
Support Hours: 8:00 AM to 10:00 PM, Monday to Sunday

We aim to respond to customer enquiries within 24 hours.

For payment-related concerns, please include your name, registered mobile number, booking ID, payment reference number, and transaction date.`;

function titleFor(lang) {
  return `${policyName} | Stay@Maredumilli`;
}

function cleanMarkdown(markdown) {
  return markdown
    .replaceAll("[insert date]", "11 July 2026")
    .replaceAll("[తేదీ నమోదు చేయండి]", "11 July 2026")
    .replaceAll("[तारीख डालें]", "11 July 2026")
    .replaceAll("[insert support contact/WhatsApp number]", "WhatsApp: +91 93924 39935, Email: stayatmaredumilli@gmail.com")
    .replaceAll("[సపోర్ట్ కాంటాక్ట్/వాట్సాప్ నంబర్ నమోదు చేయండి]", "Profile > Support")
    .replaceAll("[सहायता संपर्क/व्हाट्सएप नंबर डालें]", "Profile > Support")
    .replaceAll("[insert number]", "to be confirmed")
    .replaceAll("[సంఖ్య నమోదు చేయండి]", "to be confirmed")
    .replaceAll("[संख्या डालें]", "to be confirmed")
    .replaceAll("[To be defined — e.g., whether date/room changes are permitted before check-in. Let us know your preference and we'll add this section.]", "Date or room changes depend on hotel availability and any price difference.")
    .replaceAll("[నిర్వచించాల్సినది — ఉదా., చెక్-ఇన్‌కు ముందు తేదీ/గది మార్పులు అనుమతించబడతాయా అనేది. మీ ప్రాధాన్యతను తెలియజేయండి, మేము ఈ విభాగాన్ని జోడిస్తాము.]", "Date or room changes depend on hotel availability and any price difference.")
    .replaceAll("[परिभाषित किया जाना बाकी है — जैसे, चेक-इन से पहले तारीख/कमरा बदलने की अनुमति है या नहीं। अपनी प्राथमिकता बताएं, हम यह सेक्शन जोड़ देंगे।]", "Date or room changes depend on hotel availability and any price difference.")
    .replace(/\[[^\]]+\]/g, "to be confirmed");
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, char => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "\"": "&quot;",
    "'": "&#39;"
  }[char]));
}

function inlineMarkdown(text) {
  return escapeHtml(text)
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/\*(.+?)\*/g, "<em>$1</em>");
}

function markdownToHtml(markdown) {
  const lines = cleanMarkdown(markdown).split(/\r?\n/);
  let html = "";
  let list = null;
  const closeList = () => {
    if (list) html += `</${list}>`;
    list = null;
  };
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed === "---") {
      closeList();
      continue;
    }
    const heading = /^(#{1,6})\s+(.+)$/.exec(trimmed);
    if (heading) {
      closeList();
      const level = Math.min(6, heading[1].length);
      html += `<h${level}>${inlineMarkdown(heading[2])}</h${level}>`;
      continue;
    }
    const bullet = /^-\s+(.+)$/.exec(trimmed);
    if (bullet) {
      if (list !== "ul") {
        closeList();
        list = "ul";
        html += "<ul>";
      }
      html += `<li>${inlineMarkdown(bullet[1])}</li>`;
      continue;
    }
    const numbered = /^\d+\.\s+(.+)$/.exec(trimmed);
    if (numbered) {
      if (list !== "ol") {
        closeList();
        list = "ol";
        html += "<ol>";
      }
      html += `<li>${inlineMarkdown(numbered[1])}</li>`;
      continue;
    }
    closeList();
    html += `<p>${inlineMarkdown(trimmed)}</p>`;
  }
  closeList();
  return html;
}

function noRefundPolicyMarkdown(lang) {
  const notice = NO_REFUND_NOTICE[lang] || NO_REFUND_NOTICE.en;
  return `# Cancellation Policy — Stay@Maredumilli

*Last updated: 11 July 2026*

## 1. No Cancellation and No Refund
${notice}

## 2. No-Show
If a customer does not arrive for their booking, the booking amount is forfeited and no refund is provided.

## 3. Hotel-Side Issues
Hotel owners are not permitted to cancel or refuse a confirmed booking. If this happens, contact Stay@Maredumilli support immediately so our team can coordinate with the hotel. No refund is promised or payable by the Platform.

## 4. Questions
For any questions about this policy or your specific booking, contact our support team.

${CONTACT_MARKDOWN}`;
}

function forceTermsNoRefundSection(lang) {
  const heading = Array.from(content.querySelectorAll("h2")).find(item => /^7\./.test(item.textContent.trim()));
  if (!heading) return;
  let node = heading.nextElementSibling;
  while (node && node.tagName !== "H2") {
    const next = node.nextElementSibling;
    node.remove();
    node = next;
  }
  heading.textContent = "7. Hotel Owner Obligations";
  const p = document.createElement("p");
  p.textContent = `Hotels are not permitted to cancel or refuse a confirmed booking. If this happens, contact Stay@Maredumilli support immediately. ${NO_REFUND_NOTICE[lang] || NO_REFUND_NOTICE.en}`;
  heading.after(p);
}

function extractSections(markdown) {
  const lines = markdown.split(/\r?\n/);
  const sections = {};
  let key = null;
  for (const line of lines) {
    const match = /^# (English|Telugu|Hindi)\s+.\s+(Terms of Service|Cancellation Policy|Check-in Policy)/.exec(line);
    if (match) {
      const lang = { English: "en", Telugu: "te", Hindi: "hi" }[match[1]];
      const policy = Object.entries(POLICY_LABELS).find(([, label]) => label === match[2])?.[0];
      key = `${lang}:${policy}`;
      sections[key] = [];
      continue;
    }
    if (key) sections[key].push(line);
  }
  return sections;
}

async function renderPolicy(lang = "en") {
  const response = await fetch("/policies/all-policies-combined.md");
  const markdown = await response.text();
  const sections = extractSections(markdown);
  const section = sections[`${lang}:${slug}`] || sections[`en:${slug}`];
  content.lang = LANG_ATTR[lang] || "en";
  content.innerHTML = slug === "cancellation-policy"
    ? markdownToHtml(noRefundPolicyMarkdown(lang))
    : section ? markdownToHtml(section.join("\n")) : "<p>Policy not found.</p>";
  if (!content.textContent.includes("93924 39935")) {
    content.insertAdjacentHTML("beforeend", markdownToHtml(CONTACT_MARKDOWN));
  }
  if (slug === "terms-of-service") forceTermsNoRefundSection(lang);
  document.documentElement.lang = LANG_ATTR[lang] || "en";
  document.title = titleFor(lang);
  document.querySelector('meta[name="description"]').content = `${policyName} for Stay@Maredumilli bookings.`;
  document.querySelector('link[rel="canonical"]').href = `https://stayatmaredumilli.com/policies/${slug}`;
}

languageSelect.addEventListener("change", () => renderPolicy(languageSelect.value));
renderPolicy();
