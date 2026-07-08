$required = @(
  "index.html",
  "admin.html",
  "styles.css",
  "app.js",
  "admin.js",
  "vercel.json",
  "landing.mp4",
  "landing-vertical.mp4"
)

foreach ($file in $required) {
  if (-not (Test-Path -LiteralPath $file)) {
    throw "Missing $file"
  }
}

$html = Get-Content -Raw -LiteralPath "index.html"
$adminHtml = Get-Content -Raw -LiteralPath "admin.html"
$js = Get-Content -Raw -LiteralPath "app.js"

foreach ($id in @("home", "bookings", "profile", "propertyFeed", "bookingModal", "firecampField", "billSummary", "couponField")) {
  if ($html -notmatch "id=`"$id`"") {
    throw "Missing #$id"
  }
}

foreach ($id in @("adminRoomForm", "adminRoomList")) {
  if ($adminHtml -notmatch "id=`"$id`"") {
    throw "Missing admin #$id"
  }
}

if ($js -notmatch "formatLikes") {
  throw "Missing like formatter"
}

foreach ($fn in @("priceForDates", "rankedAmenities", "hasFirecamp")) {
  if ($js -notmatch $fn) {
    throw "Missing $fn"
  }
}

"Smoke check passed"
