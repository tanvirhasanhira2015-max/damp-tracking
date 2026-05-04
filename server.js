const express = require("express");
const { createClient } = require("@supabase/supabase-js");

const app = express();

// Supabase connect (Service Role Secret Key)
const supabaseUrl = "https://jguvvzxwuaomwxqpyzpg.supabase.co";
const supabaseKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpndXZ2enh3dWFvbXd4cXB5enBnIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3Nzg1OTcyNywiZXhwIjoyMDkzNDM1NzI3fQ.RtU0yF8KlMVuk_Z_Rturbkc77vSFXr0yxg4F6fxPEL8"; 
const supabase = createClient(supabaseUrl, supabaseKey);

// 1x1 Invisible Pixel
const PIXEL = Buffer.from("R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7", "base64");

// Final Open Tracking Route
app.get("/track/open/:trackingId", async (req, res) => {
  const trackingId = req.params.trackingId.trim();

  try {
    await supabase
      .from("campaign_logs")
      .update({
        status: "opened",
        opened_at: new Date().toISOString(),
      })
      .eq("tracking_id", trackingId);
  } catch (err) {
    console.error("Database Update Error:", err.message);
  }

  // ক্লায়েন্টকে অদৃশ্য পিক্সেল পাঠানো হবে
  res.set("Content-Type", "image/gif");
  res.set("Cache-Control", "no-cache, no-store, must-revalidate");
  res.send(PIXEL);
});

// Railway এর জন্য পোর্ট
const PORT = process.env.PORT || 8080;
app.listen(PORT, "0.0.0.0", () => {
  console.log(`Live Tracking Server running on port ${PORT}...`);
});
