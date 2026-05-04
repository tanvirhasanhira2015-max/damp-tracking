const express = require("express");
const { createClient } = require("@supabase/supabase-js");
const log = require("electron-log");

const app = express();
app.use(express.json());

// Supabase connect (আপনার দেওয়া সঠিক Anon Public Key বসানো হয়েছে)
const supabase = createClient(
  "https://jguvvzxwuaomwxqpyzpg.supabase.co",
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpndXZ2enh3dWFvbXd4cXB5enBnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzc4NTk3MjcsImV4cCI6MjA5MzQzNTcyN30.cnWMggvj3O37x_EgXJZJXPT4oP37zxlxqWTfT7afnuU"
);

// 1x1 pixel
const PIXEL = Buffer.from(
  "R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7",
  "base64"
);

// Open tracking
app.get("/track/open/:trackingId", async (req, res) => {
  const { trackingId } = req.params;

  try {
    await supabase
      .from("campaign_logs")
      .update({
        status: "opened",
        opened_at: new Date().toISOString(),
      })
      .eq("tracking_id", trackingId); // ✅ FIXED
  } catch (e) {
    log.error("Track open error:", e.message);
  }

  res.set("Content-Type", "image/gif");
  res.set("Cache-Control", "no-cache, no-store, must-revalidate");
  res.send(PIXEL);
});

// Click tracking
app.get("/track/click/:trackingId", async (req, res) => {
  const { trackingId } = req.params;
  const { url } = req.query;

  try {
    await supabase
      .from("campaign_logs")
      .update({
        clicked_at: new Date().toISOString(),
      })
      .eq("tracking_id", trackingId); // ✅ FIXED
  } catch (e) {
    log.error("Track click error:", e.message);
  }

  if (url) res.redirect(decodeURIComponent(url));
  else res.send("OK");
});

// Unsubscribe
app.get("/unsubscribe/:email", async (req, res) => {
  const { email } = req.params;

  try {
    await supabase.from("suppression_list").insert([
      {
        email,
        reason: "unsubscribed",
        created_at: new Date().toISOString(),
      },
    ]);

    await supabase
      .from("contacts")
      .update({ status: "unsubscribed" })
      .eq("email", email);

    log.info(`Unsubscribed: ${email}`);
  } catch (e) {
    log.error("Unsubscribe error:", e.message);
  }

  res.send(`
    <html>
      <body style="text-align:center;padding:60px;background:#0f0f1a;color:#fff">
        <h2>✅ Unsubscribed Successfully</h2>
      </body>
    </html>
  `);
});

// Server start
const PORT = process.env.PORT || 8080;

app.listen(PORT, "0.0.0.0", () => {
  console.log("Tracking server running on port " + PORT);
  log.info("Tracking server running on port " + PORT);
});

module.exports = app;
