module.exports = async function handler(req, res) {
  res.status(200).json({
    supabase_url: process.env.SUPABASE_URL ? "defined" : "missing",
    supabase_service_role_key: process.env.SUPABASE_SERVICE_ROLE_KEY ? "defined" : "missing",
    razorpay_key_id: process.env.RAZORPAY_KEY_ID ? "defined" : "missing",
    razorpay_key_id_prefix: process.env.RAZORPAY_KEY_ID ? process.env.RAZORPAY_KEY_ID.slice(0, 8) : "none",
    razorpay_key_secret: process.env.RAZORPAY_KEY_SECRET ? "defined" : "missing",
    razorpay_key_secret_length: process.env.RAZORPAY_KEY_SECRET ? process.env.RAZORPAY_KEY_SECRET.length : 0
  });
};
