const fs = require("fs");

const read = file => fs.readFileSync(file, "utf8").toLowerCase();
const files = [
  "security-hardening-rls-migration.sql",
  "security-hardening-booking-rpc-migration.sql",
  "storage-rls-hardening-migration.sql",
  "payment-confirm-expired-hold-migration.sql",
  "owner-release-offline-only-migration.sql",
  "booking-guest-count-validation-migration.sql",
  "payment-default-razorpay-migration.sql",
  "payment-confirm-capacity-migration.sql",
  "offline-booking-hold-capacity-migration.sql",
  "supabase-schema.sql"
].map(read).join("\n");

const required = [
  "enable row level security",
  "create_booking_hold_safe",
  "confirm_booking_hold_safe",
  "room images admin write",
  "public.is_admin()",
  "revoke select on public.bookings from anon",
  "v_hold.status not in ('held', 'expired')",
  "where payment_id = p_razorpay_payment_id",
  "status = 'offline_blocked'",
  "p_num_adults < 1 or p_num_kids < 0"
];

for (const text of required) {
  if (!files.includes(text)) throw new Error(`SQL hardening missing: ${text}`);
}

for (const file of ["supabase-schema.sql", "payment-settings-rpc-migration.sql", "manual-upi-payment-migration.sql", "payment-default-razorpay-migration.sql"]) {
  if (read(file).includes('"mode": "manual"')) throw new Error(`${file} must not default payment mode to manual.`);
}

if (/create policy[\s\S]{0,220}using\s*\(\s*true\s*\)[\s\S]{0,80}with check\s*\(\s*true\s*\)/.test(read("supabase-schema.sql"))) {
  throw new Error("supabase-schema.sql must not create broad authenticated write policies.");
}

for (const file of ["supabase-schema.sql", "payment-confirm-expired-hold-migration.sql", "payment-confirm-capacity-migration.sql"]) {
  const sql = read(file);
  if (!sql.includes("id <> v_hold.id") || !sql.includes("room is no longer available for the selected dates")) {
    throw new Error(`${file} must recheck capacity before confirming a payment hold.`);
  }
}

for (const file of ["supabase-schema.sql", "offline-booking-hold-capacity-migration.sql"]) {
  const sql = read(file);
  const start = sql.indexOf("create or replace function public.create_booking_safe");
  const chunk = start >= 0 ? sql.slice(start, start + 7000) : "";
  if (!chunk.includes("from public.booking_holds") || !chunk.includes("v_booked + v_held + p_num_rooms")) {
    throw new Error(`${file} must count active payment holds before offline/manual bookings.`);
  }
}

console.log("sql hardening check passed");
