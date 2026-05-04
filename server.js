const express = require("express");
const { createClient } = require("@supabase/supabase-js");

const app = express();

// Supabase connect (Service Role Secret Key)
const supabaseUrl = "https://jguvvzxwuaomwxqpyzpg.supabase.co";
const supabaseKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpndXZ2enh3dWFvbXd4cXB5enBnIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3Nzg1OTcyNywiZXhwIjoyMDkzNDM1NzI3fQ.RtU0yF8KlMVuk_Z_Rturbkc77vSFXr0yxg4F6fxPEL8"; 
const supabase = createClient(supabaseUrl, supabaseKey);

// 1x1 Invisible Pixel (অদৃশ্য পিক্সেল)
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
      .select("campaign_id"); // এর মাধ্যমে ক্যাম্পেইন আইডিটি বের করে আনা হচ্ছে

    // ২. যদি লগ আপডেট সফল হয়, তবে মেইন ক্যাম্পেইন টেবিলের কাউন্টার বাড়ানো
    if (!logError && updatedLogs && updatedLogs.length > 0) {
      const campaignId = updatedLogs[0].campaign_id;
      
      // ক্যাম্পেইনের বর্তমান ওপেন সংখ্যা কত তা জানা
      const { data: campData } = await supabase
        .from("campaigns")
        .select("opens_count")
        .eq("id", campaignId)
        .single();
      
      const newCount = (campData?.opens_count || 0) + 1;

      // নতুন সংখ্যাটি আপডেট করে দেওয়া
      await supabase
        .from("campaigns")
        .update({ opens_count: newCount })
        .eq("id", campaignId);
    }
  } catch (err) {
    console.error("Database Update Error:", err.message);
  }

  // ক্লায়েন্টকে অদৃশ্য পিক্সেল রেসপন্স পাঠানো
  res.set("Content-Type", "image/gif");
  res.set("Cache-Control", "no-cache, no-store, must-revalidate");
  res.send(PIXEL);
});

// Railway এর পোর্টে রান করা
const PORT = process.env.PORT || 8080;
app.listen(PORT, "0.0.0.0", () => {
  console.log(`Live Tracking Server running on port ${PORT}...`);
});
