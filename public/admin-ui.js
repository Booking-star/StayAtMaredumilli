function setStatus(message = "", isError = false) {
  const adminStatus = document.querySelector("#adminStatus");
  if (!adminStatus) return;
  adminStatus.textContent = cleanAdminMessage(message);
  adminStatus.style.display = message ? "block" : "none";
  adminStatus.classList.toggle("error", Boolean(isError));
}

function notifyAdmin(message, isError = false) {
  setStatus(message, isError);
}

function cleanAdminMessage(message = "") {
  const text = String(message || "");
  if (/supabase|vercel|github|environment|row-level security|permission denied|violates|service role|schema cache|rpc|rest\/v1/i.test(text)) {
    return "Action could not be completed. Please check permissions or try again.";
  }
  return text;
}

function showError(message) {
  const cleanMessage = cleanAdminMessage(message || "Something went wrong. Please try again.");
  setSaving(false);
  notifyAdmin(cleanMessage, true);
  alert(cleanMessage);
}

function setSaving(saving) {
  const saveButton = document.querySelector("#adminRoomForm button[type='submit']");
  if (!saveButton) return;
  saveButton.disabled = Boolean(saving);
  saveButton.textContent = saving ? "Saving..." : "Save Room";
}

function adminTable(headers, rows, emptyText) {
  if (!rows.length) return `<p class="muted-line">${escapeHtml(emptyText)}</p>`;
  return `
    <div class="admin-table-wrap">
      <table class="admin-data-table">
        <thead><tr>${headers.map(h => `<th>${escapeHtml(h)}</th>`).join("")}</tr></thead>
        <tbody>${rows.map(row => `<tr>${row.map(cell => `<td>${escapeHtml(cell)}</td>`).join("")}</tr>`).join("")}</tbody>
      </table>
    </div>
  `;
}
