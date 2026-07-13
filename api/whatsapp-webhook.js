export default async function handler(req, res) {
  if (req.method === "GET") {
    const mode = req.query["hub.mode"];
    const token = req.query["hub.verify_token"];
    const challenge = req.query["hub.challenge"];
    if (mode === "subscribe" && token && token === process.env.WHATSAPP_VERIFY_TOKEN) {
      return res.status(200).send(challenge || "");
    }
    return res.status(403).send("Forbidden");
  }

  if (req.method === "POST") {
    return res.status(200).json({ received: true });
  }

  return res.status(405).json({ error: "Method not allowed" });
}
