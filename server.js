const express = require("express");
const { createClient } = require("@supabase/supabase-js");

const app = express();

// Supabase connect (Service Role Secret Key)
const supabaseUrl = "https://jguvvzxwuaomwxqpyzpg.supabase.co";
const supabaseKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpndXZ2enh3dWFvbXd4cXB5enBnIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3Nzg1OTcyNywiZXhwIjoyMDkzNDM1NzI3fQ.RtU0yF8KlMVuk_Z_Rturbkc77vSFXr0yxg4F6fxPEL8"; 
const supabase = createClient(supabaseUrl, supabaseKey);

// 1x1 Invisible Pixel (অদৃশ্য পিক্সেল)
const PIXEL = Buffer.from("R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7", "base64");

// ── 1. OPEN TRACKING ROUTE (SMART TIME-BASED FILTER) ─────
app.get("/track/open/:trackingId", async (req, res) => {
  const trackingId = req.params.trackingId.trim();
  const userAgent = req.headers["user-agent"] || "";

  // ক্লায়েন্টকে আগে রেসপন্স পাঠিয়ে দেওয়া হচ্ছে যাতে ইউজারের ইমেইল লোড হতে দেরি না হয়
  res.set("Content-Type", "image/gif");
  res.set("Cache-Control", "no-cache, no-store, must-revalidate");
  res.send(PIXEL);

  // 🚨 Strict Bot Filtering
  // গুগল ইমেজ প্রক্সিকে সরাসরি ব্লক করা যাবে না, কারণ জিমেইল ইউজাররাও এটি ব্যবহার করে।
  // আমরা শুধু অন্যান্য স্পষ্ট স্প্যাম বটগুলোকে ব্লক করব।
  const isStrictBot = /bot(?!googleimage)|crawler|spider|slurp/i.test(userAgent);
  if (isStrictBot) {
    console.log("Strict bot detected, skipped:", trackingId);
    return;
  }

  try {
    // ডাটাবেস থেকে লগের স্ট্যাটাস এবং 'sent_at' (মেইল পাঠানোর সময়) আনা হলো
    const { data: existingLog } = await supabase
      .from("campaign_logs")
      .select("status, campaign_id, sent_at")
      .eq("tracking_id", trackingId)
      .single();

    // যদি আগে থেকেই opened না থাকে, তবেই আমরা লজিক চালাব
    if (existingLog && existingLog.status !== "opened") {
      
      // 🚨 Smart Time-Based Bot Filter
      const isGoogleProxy = /googleimageproxy/i.test(userAgent);

      if (isGoogleProxy && existingLog.sent_at) {
        const sentTime = new Date(existingLog.sent_at).getTime();
        const nowTime = new Date().getTime();
        const diffInSeconds = (nowTime - sentTime) / 1000;

        // মেইল পাঠানোর ১৫ সেকেন্ডের মধ্যে গুগল স্ক্যান করলে সেটি ফেক ওপেন (বট)
        if (diffInSeconds < 15) {
          console.log("Ignored auto-prefetch by Google bot for:", trackingId);
          return; // কাউন্ট না করে বের হয়ে যাবে
        }
      }

      // আসল ওপেন হিসেবে ডাটাবেস আপডেট করা (স্ট্যাটাস 'opened' করা)
      const { error: logError } = await supabase
        .from("campaign_logs")
        .update({
          status: "opened",
          opened_at: new Date().toISOString(),
        })
        .eq("tracking_id", trackingId);

      // লগ আপডেট সফল হলে মেইন ক্যাম্পেইন টেবিলের কাউন্টার বাড়ানো
      if (!logError && existingLog.campaign_id) {
        const campaignId = existingLog.campaign_id;
        
        const { data: campData } = await supabase
          .from("campaigns")
          .select("total_opened, opens_count") 
          .eq("id", campaignId)
          .single();
        
        const currentCount = campData?.total_opened || campData?.opens_count || 0;
        const newCount = currentCount + 1;

        await supabase
          .from("campaigns")
          .update({ total_opened: newCount, opens_count: newCount }) 
          .eq("id", campaignId);
      }
    }
  } catch (err) {
    console.error("Database Update Error:", err.message);
  }
});

// ── 2. UNSUBSCRIBE ROUTE ─────────────────────────────────
app.get("/unsubscribe/:email", async (req, res) => {
  const email = decodeURIComponent(req.params.email).trim().toLowerCase();

  try {
    // Suppression list e add kora
    const { error: supError } = await supabase
      .from("suppression_list")
      .upsert({ email: email, reason: "user unsubscribed" });

    if (supError) throw supError;

    // Contacts table e status 'suppressed' kora
    await supabase
      .from("contacts")
      .update({ status: "suppressed" })
      .eq("email", email);

    // User ke success message dekhano
    res.status(200).send(`
      <html>
        <body style="font-family:sans-serif;text-align:center;padding:50px;background:#f9fafb;color:#111827;">
          <div style="max-width:500px;margin:0 auto;background:white;padding:30px;border-radius:10px;box-shadow:0 4px 6px rgba(0,0,0,0.1);">
            <h2 style="color:#dc2626;">Unsubscribed Successfully</h2>
            <p>You have been removed from our mailing list and will no longer receive emails from us.</p>
          </div>
        </body>
      </html>
    `);
  } catch (err) {
    console.error("Unsubscribe Error:", err.message);
    res.status(500).send("An error occurred. Please try again.");
  }
});

// Railway এর পোর্টে রান করা
const PORT = process.env.PORT || 8080;
app.listen(PORT, "0.0.0.0", () => {
  console.log(`Live Tracking Server running on port ${PORT}...`);
});
