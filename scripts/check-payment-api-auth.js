const createPaymentHold = require("../api/create-payment-hold");
const verifyPayment = require("../api/verify-payment");

function res() {
  return {
  statusCode: 0,
  body: null,
  status(code) { this.statusCode = code; return this; },
  json(body) { this.body = body; return this; }
  };
}

async function check() {
  const createRes = res();
  await createPaymentHold({ method: "POST", headers: {}, body: {}, socket: { remoteAddress: "test" } }, createRes);
  console.assert(createRes.statusCode === 401, "create-payment-hold must require login");

  const verifyRes = res();
  await verifyPayment({
    method: "POST",
    headers: {},
    body: { hold_id: "h", razorpay_order_id: "o", razorpay_payment_id: "p" }
  }, verifyRes);
  console.assert(verifyRes.statusCode === 401, "verify-payment must require login");

  console.log("payment api auth check passed");
}

check().catch(error => {
  console.error(error);
  process.exit(1);
});
