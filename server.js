const express = require("express");
const { createClient } = require("@supabase/supabase-js");

const app = express();

// Supabase connect (Service Role Secret Key)
const supabaseUrl = "https://jguvvzxwuaomwxqpyzpg.supabase.co";
const supabaseKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpndXZ2enh3dWFvbXd4cXB5enBnIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3Nzg1OTcyNywiZXhwIjoyMDkzNDM1NzI3fQ.RtU0yF8KlMVuk_Z_Rturbkc77vSFXr0yxg4F6fxPEL8"; 
const supabase = createClient(supabaseUrl, supabaseKey);

// 1x1 Invisible Pixel
const PIXEL = Buffer.from("R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7", "base64");

// ── 1. OPEN TRACKING ROUTE (100% SECURE - 2026 UPDATE) ─────────
app.get("/track/open/:trackingId", async (req, res) => {
  const trackingId = req.params.trackingId.trim();
  const userAgent = (req.headers["user-agent"] || "").toLowerCase();

  res.set("Content-Type", "image/gif");
  res.set("Cache-Control", "no-cache, no-store, must-revalidate");
  res.send(PIXEL);

  // 🚨 ১. Standard Bot Filter
  const isStrictBot = /bot(?!googleimage)|crawler|spider|slurp|facebookexternalhit|dataprovider/i.test(userAgent);
  
  // 🚨 ২. The NEW 2026 Gmail Prefetch Filter (The Ultimate Fix)
  // গুগল এখন ফেক ইউজার-এজেন্ট ব্যবহার করে (Edge/12.246 বা Chrome/42.0.2311.135)
  const isGmailPrefetch = userAgent.includes("edge/12.246") || userAgent.includes("chrome/42.0.2311.135");

  if (isStrictBot || isGmailPrefetch) {
    console.log(`[Blocked] Fake Bot / Prefetch detected for: ${trackingId}`);
    return; // এটি ফেক ওপেন, তাই ডাটাবেসে সেভ হবে না
  }

  try {
    const { data: existingLog } = await supabase
      .from("campaign_logs")
      .select("status, campaign_id, sent_at")
      .eq("tracking_id", trackingId)
      .single();

    if (existingLog && existingLog.status !== "opened") {
      
      // 🚨 ৩. Legacy Google Proxy Filter (Safety Buffer)
      const isGoogleProxy = userAgent.includes("googleimageproxy");
      if (isGoogleProxy && existingLog.sent_at) {
        const diffInSeconds = (new Date().getTime() - new Date(existingLog.sent_at).getTime()) / 1000;
        if (diffInSeconds < 20) {
          console.log(`[Blocked] Legacy Google Proxy prefetch for: ${trackingId}`);
          return; 
        }
      }

      // আসল ওপেন আপডেট
      const { error: logError } = await supabase
        .from("campaign_logs")
        .update({
          status: "opened",
          opened_at: new Date().toISOString(),
        })
        .eq("tracking_id", trackingId);

      // মেইন Campaigns টেবিল আপডেট (total_opened)
      if (!logError && existingLog.campaign_id) {
        const campaignId = existingLog.campaign_id;
        
        const { data: campData } = await supabase
          .from("campaigns")
          .select("total_opened") 
          .eq("id", campaignId)
          .single();
        
        const newCount = (campData?.total_opened || 0) + 1;

        await supabase
          .from("campaigns")
          .update({ total_opened: newCount }) 
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
    const { error: supError } = await supabase
      .from("suppression_list")
      .upsert({ email: email, reason: "user unsubscribed" });

    if (supError) throw supError;

    await supabase
      .from("contacts")
      .update({ status: "suppressed" })
      .eq("email", email);

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

const PORT = process.env.PORT || 8080;
app.listen(PORT, "0.0.0.0", () => {
  console.log(`Live Tracking Server running on port ${PORT}...`);
});
