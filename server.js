const express = require("express");
const { createClient } = require("@supabase/supabase-js");

const app = express();

// Supabase connect (Service Role Secret Key)
const supabaseUrl = "https://jguvvzxwuaomwxqpyzpg.supabase.co";
const supabaseKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpndXZ2enh3dWFvbXd4cXB5enBnIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3Nzg1OTcyNywiZXhwIjoyMDkzNDM1NzI3fQ.RtU0yF8KlMVuk_Z_Rturbkc77vSFXr0yxg4F6fxPEL8"; 
const supabase = createClient(supabaseUrl, supabaseKey);

// 1x1 Invisible Pixel (অদৃশ্য পিক্সেল)
const PIXEL = Buffer.from("R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7", "base64");

// ── 1. OPEN TRACKING ROUTE (100% SECURE & SYNCED) ─────────
app.get("/track/open/:trackingId", async (req, res) => {
  const trackingId = req.params.trackingId.trim();
  const userAgent = (req.headers["user-agent"] || "").toLowerCase();

  // ১. ইউজারকে সাথে সাথে পিক্সেল রিটার্ন করা (যাতে ইমেইল লোড হতে দেরি না হয়)
  res.set("Content-Type", "image/gif");
  res.set("Cache-Control", "no-cache, no-store, must-revalidate");
  res.send(PIXEL);

  // ২. Strict Bot Filter (স্পষ্ট স্প্যাম বটগুলোকে ব্লক করা)
  const isStrictBot = /bot(?!googleimage)|crawler|spider|slurp|facebookexternalhit|dataprovider/i.test(userAgent);
  if (isStrictBot) return;

  try {
    // ৩. ডাটাবেস থেকে বর্তমান লগের স্ট্যাটাস চেক করা
    const { data: existingLog } = await supabase
      .from("campaign_logs")
      .select("status, campaign_id, sent_at")
      .eq("tracking_id", trackingId)
      .single();

    // যদি লগটি আগে থেকেই 'opened' না থাকে, তবেই আমরা সামনে এগোব (Duplicate protection)
    if (existingLog && existingLog.status !== "opened") {
      
      // ৪. Google Image Proxy (Auto-Cache) ফিল্টার 
      // গুগল জিমেইল মেইল রিসিভ করার সাথে সাথেই (সাধারণত ১-১০ সেকেন্ডের মধ্যে) ছবি ক্যাশ করে। 
      // আমরা ২০ সেকেন্ডের একটি সেফটি বাফার রাখছি। মেইল পাঠানোর ২০ সেকেন্ডের মধ্যে গুগলের রিকোয়েস্ট এলে সেটি ফেক ওপেন!
      const isGoogleProxy = userAgent.includes("googleimageproxy");
      
      if (isGoogleProxy && existingLog.sent_at) {
        const sentTime = new Date(existingLog.sent_at).getTime();
        const nowTime = new Date().getTime();
        const diffInSeconds = (nowTime - sentTime) / 1000;

        if (diffInSeconds < 20) {
          console.log(`[Blocked] Auto-prefetch by Google Proxy for tracking ID: ${trackingId}`);
          return; // এটি আসল ওপেন নয়, তাই কাউন্ট না করেই বের হয়ে যাবে
        }
      }

      // ৫. ডাটাবেসে লগ 'opened' হিসেবে আপডেট করা
      const { error: logError } = await supabase
        .from("campaign_logs")
        .update({
          status: "opened",
          opened_at: new Date().toISOString(),
        })
        .eq("tracking_id", trackingId);

      // ৬. মেইন Campaigns টেবিল আপডেট করা (The Ultimate Fix)
      // এখানে শুধু total_opened কলামটিকেই আপডেট করা হচ্ছে, যা আপনার স্ক্রিনশটের সাথে ১০০% মিলে যায়।
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

// Railway এর পোর্টে রান করা
const PORT = process.env.PORT || 8080;
app.listen(PORT, "0.0.0.0", () => {
  console.log(`Live Tracking Server running on port ${PORT}...`);
});
