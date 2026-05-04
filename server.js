const express = require("express");
const { createClient } = require("@supabase/supabase-js");

const app = express();

// Supabase connect
const supabaseUrl = "https://jguvvzxwuaomwxqpyzpg.supabase.co";
const supabaseKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpndXZ2enh3dWFvbXd4cXB5enBnIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3Nzg1OTcyNywiZXhwIjoyMDkzNDM1NzI3fQ.RtU0yF8KlMVuk_Z_Rturbkc77vSFXr0yxg4F6fxPEL8"; 
const supabase = createClient(supabaseUrl, supabaseKey);

// 1x1 Invisible Pixel
const PIXEL = Buffer.from("R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7", "base64");

// Final Open Tracking Route
app.get("/track/open/:trackingId", async (req, res) => {
  const trackingId = req.params.trackingId.trim();

  try {
    // ১. প্রথমে লগের স্ট্যাটাস 'opened' হিসেবে আপডেট করা
    const { data: updatedLogs, error: logError } = await supabase
      .from("campaign_logs")
      .update({
        status: "opened",
        opened_at: new Date().toISOString(),
      })
      .eq("tracking_id", trackingId)
      .select("campaign_id");

    // ২. যদি লগ আপডেট সফল হয়, তবে মেইন ক্যাম্পেইন টেবিলের কাউন্টার বাড়ানো
    if (!logError && updatedLogs && updatedLogs.length > 0) {
      const campaignId = updatedLogs[0].campaign_id;
      
      // ক্যাম্পেইনের বর্তমান 'total_opened' সংখ্যা কত তা জানা (সংশোধিত নাম)
      const { data: campData } = await supabase
        .from("campaigns")
        .select("total_opened") 
        .eq("id", campaignId)
        .single();
      
      const newCount = (campData?.total_opened || 0) + 1;

      // সঠিক কলামে নতুন সংখ্যাটি আপডেট করে দেওয়া
      await supabase
        .from("campaigns")
        .update({ total_opened: newCount }) 
        .eq("id", campaignId);
    }
  } catch (err) {
    console.error("Database Update Error:", err.message);
  }

  res.set("Content-Type", "image/gif");
  res.set("Cache-Control", "no-cache, no-store, must-revalidate");
  res.send(PIXEL);
});

// Railway এর পোর্টে রান করা
const PORT = process.env.PORT || 8080;
app.listen(PORT, "0.0.0.0", () => {
  console.log(`Live Tracking Server running on port ${PORT}...`);
});
