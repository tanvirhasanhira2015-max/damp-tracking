const express = require("express");
const { createClient } = require("@supabase/supabase-js");

const app = express();
app.use(express.json());

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_KEY
);

// 1x1 transparent GIF pixel
const PIXEL = Buffer.from(
  "R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7",
  "base64"
);

// ── Open Tracking ─────────────────────────────────────────────
app.get("/track/open/:trackingId", async (req, res) => {
  const { trackingId } = req.params;
  try {
    await supabase
      .from("campaign_logs")
      .update({
        status: "opened",
        opened_at: new Date().toISOString()
      })
      .eq("tracking_id", trackingId)
      .eq("status", "sent");
  } catch (e) {
    console.error("Track open error:", e.message);
  }
  res.set("Content-Type", "image/gif");
  res.set("Cache-Control", "no-cache, no-store, must-revalidate");
  res.send(PIXEL);
});

// ── Click Tracking ────────────────────────────────────────────
app.get("/track/click/:trackingId", async (req, res) => {
  const { trackingId } = req.params;
  const { url } = req.query;
  try {
    await supabase
      .from("campaign_logs")
      .update({ clicked_at: new Date().toISOString() })
      .eq("tracking_id", trackingId);
  } catch (e) {
    console.error("Track click error:", e.message);
  }
  if (url) res.redirect(decodeURIComponent(url));
  else res.send("OK");
});

// ── Unsubscribe ───────────────────────────────────────────────
app.get("/unsubscribe/:email", async (req, res) => {
  const { email } = req.params;
  try {
    await supabase.from("suppression_list").upsert({
      email, reason: "unsubscribed"
    });
    await supabase.from("contacts")
      .update({ status: "unsubscribed" })
      .eq("email", email);
  } catch (e) {
    console.error("Unsubscribe error:", e.message);
  }
  res.send(`
    <!DOCTYPE html>
    <html>
    <body style="font-family:sans-serif;text-align:center;padding:60px;background:#0f0f1a;color:#fff">
      <h2>✅ Unsubscribed Successfully</h2>
      <p>You have been removed from our mailing list.</p>
    </body>
    </html>
  `);
});

// ── Health check ──────────────────────────────────────────────
app.get("/", (req, res) => {
  res.send("DAMP Tracking Server is running ✅");
});

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
  console.log(`Tracking server running on port ${PORT}`);
});