const fetch = require("node-fetch"); // In Vercel Node env, fetch is built-in, but node-fetch is available if needed, or we can use dynamic import, or global fetch since Vercel Node 18+ has native fetch. Let's use global fetch.

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const githubToken = process.env.GITHUB_TOKEN;

  if (!url || !key) {
    return res.status(500).json({ error: "Supabase configuration is missing on the server." });
  }
  if (!githubToken) {
    return res.status(500).json({ error: "GITHUB_TOKEN environment variable is not configured." });
  }

  try {
    // 1. Authenticate user
    const token = (req.headers.authorization || "").replace(/^Bearer\s+/i, "");
    if (!token) {
      return res.status(401).json({ error: "Unauthorized: Missing token." });
    }

    const userResponse = await fetch(`${url}/auth/v1/user`, {
      headers: { apikey: key, authorization: `Bearer ${token}` }
    });
    const user = userResponse.ok ? await userResponse.json() : null;
    if (!user || !user.id) {
      return res.status(401).json({ error: "Unauthorized: Invalid session." });
    }

    // Check if user is admin
    const profileResponse = await fetch(`${url}/rest/v1/profiles?id=eq.${user.id}&select=role`, {
      headers: { apikey: key, authorization: `Bearer ${key}` }
    });
    const profile = profileResponse.ok ? (await profileResponse.json())?.[0] : null;

    const isAdmin = user.email === "admin@staymaredumilli.com" || 
                    user.email === "admin@stayatmaredumilli.com" || 
                    profile?.role === "admin";

    if (!isAdmin) {
      return res.status(403).json({ error: "Access denied: Admin only." });
    }

    // 2. Parse request payload
    const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : (req.body || {});
    const { filename, content } = body; // content is base64 string

    if (!filename || !content) {
      return res.status(400).json({ error: "Missing filename or image content." });
    }

    // Clean filename
    const safeName = filename.replace(/[^a-z0-9.-]/gi, "_");
    const path = `public/images/rooms/${Date.now()}-${safeName}`;

    // 3. Upload to GitHub via REST API
    const ghResponse = await fetch(`https://api.github.com/repos/kandregulaashok15-gif/StayAtMaredumilli/contents/${path}`, {
      method: "PUT",
      headers: {
        "Authorization": `token ${githubToken}`,
        "Accept": "application/vnd.github.v3+json",
        "User-Agent": "StayAtMaredumilli-Upload-API"
      },
      body: JSON.stringify({
        message: `upload: add room image ${safeName} via Admin Portal`,
        content: content // base64 string
      })
    });

    if (!ghResponse.ok) {
      const errText = await ghResponse.text();
      console.error("GitHub API upload failed:", errText);
      return res.status(500).json({ error: `GitHub API upload failed: ${ghResponse.status} ${errText}` });
    }

    // 4. Return relative local path
    const relativeUrl = `/images/rooms/${path.split("public/images/rooms/")[1]}`;
    return res.status(200).json({ url: relativeUrl });
  } catch (err) {
    console.error("Upload error handler:", err);
    return res.status(500).json({ error: err.message });
  }
};
