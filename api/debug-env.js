module.exports = async function handler(req, res) {
  const envs = {};
  for (const key of Object.keys(process.env)) {
    if (key.startsWith("SUPABASE_") || key.startsWith("RAZORPAY_") || key.includes("ROLE") || key.includes("KEY")) {
      envs[key] = {
        defined: true,
        length: process.env[key] ? process.env[key].length : 0,
        prefix: process.env[key] ? process.env[key].slice(0, 8) : "none"
      };
    }
  }
  res.status(200).json(envs);
};
