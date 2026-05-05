const { getGmailClient } = require("./auth");
const { v4: uuidv4 } = require("uuid");
const log = require("electron-log");
const { BrowserWindow } = require("electron");
const { createClient } = require("@supabase/supabase-js");
const Store = require("electron-store");

// ১. সুপাবেস কানেকশন (Main ও IPC-Handlers এর সাথে মিল রেখে Service Role Key ব্যবহার করা হয়েছে)
const supabase = createClient(
  "https://jguvvzxwuaomwxqpyzpg.supabase.co",
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpndXZ2enh3dWFvbXd4cXB5enBnIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3Nzg1OTcyNywiZXhwIjoyMDkzNDM1NzI3fQ.RtU0yF8KlMVuk_Z_Rturbkc77vSFXr0yxg4F6fxPEL8"
);

const activeCampaigns = new Map();

function sendProgress(campaignId, data) {
  const wins = BrowserWindow.getAllWindows();
  if (wins.length > 0) {
    wins[0].webContents.send("campaign-progress", { campaignId, ...data });
  }
}

async function logToDb(level, message, campaignId) {
  try {
    await supabase.from("send_logs").insert({
      level, 
      message, 
      campaign_id: campaignId || null,
      created_at: new Date().toISOString()
    });
  } catch (e) {
    log.error("Database logging failed:", e.message);
  }
}

async function startCampaignEngine(campaignId) {
  if (activeCampaigns.has(campaignId) && activeCampaigns.get(campaignId).running) {
    return;
  }

  try {
    const { data: campaign, error: campError } = await supabase
      .from("campaigns").select("*").eq("id", campaignId).single();
    
    if (campError || !campaign) throw new Error("ক্যাম্পেইন পাওয়া যায়নি।");

    const { data: account, error: accError } = await supabase
      .from("accounts").select("*").eq("id", campaign.account_id).single();
    
    if (accError || !account || !account.enabled) {
      throw new Error("সিলেক্ট করা জিমেইল অ্যাকাউন্টটি সচল নয়।");
    }

    const audienceFilter = (() => {
      try { return JSON.parse(campaign.audience_filter || "{}"); } catch(e) { return {}; }
    })();

    // ২. গ্লোবাল ব্লকলিস্ট (Unsubscribe করা লোকদের জন্য)
    const { data: suppressedData } = await supabase.from("suppression_list").select("email");
    const suppressedEmails = new Set((suppressedData || []).map(r => r.email.toLowerCase()));

    let contactQuery = supabase.from("contacts").select("*").eq("status", "active");
    if (audienceFilter.listName) {
      contactQuery = contactQuery.eq("list_name", audienceFilter.listName);
    }
    
    const { data: allContacts } = await contactQuery;
    const contacts = (allContacts || []).filter(c => !suppressedEmails.has(c.email.toLowerCase()));

    if (contacts.length === 0) throw new Error("পাঠানোর মতো কোনো কন্টাক্ট পাওয়া যায়নি।");

    // ৩. ক্যাম্পেইন-ভিত্তিক ফিল্টার (স্মার্ট ফলো-আপ লজিক)
    // এটি শুধু চেক করবে এই নির্দিষ্ট ক্যাম্পেইনে আগে মেইল গেছে কি না
    const { data: sentData } = await supabase
      .from("campaign_logs")
      .select("email")
      .eq("campaign_id", campaignId)
      .neq("status", "failed");

    const alreadySentInThisCampaign = new Set((sentData || []).map(r => r.email.toLowerCase()));
    const toSend = contacts.filter(c => !alreadySentInThisCampaign.has(c.email.toLowerCase()));

    if (toSend.length === 0) {
        await supabase.from("campaigns").update({ status: "completed" }).eq("id", campaignId);
        sendProgress(campaignId, { status: "completed", sent: contacts.length, total: contacts.length });
        return;
    }

    await supabase.from("campaigns").update({
      status: "running",
      total_recipients: contacts.length,
      started_at: new Date().toISOString()
    }).eq("id", campaignId);

    const store = new Store();
    const settings = store.get("settings", { minDelay: 30, maxDelay: 120, trackingEnabled: true });

    activeCampaigns.set(campaignId, { running: true });

    let gmail;
    const tokens = typeof account.tokens === "string" ? JSON.parse(account.tokens) : account.tokens;
    gmail = await getGmailClient({ ...account, tokens });

    const sendLoop = async () => {
      let currentSentCount = alreadySentInThisCampaign.size;

      for (let i = 0; i < toSend.length; i++) {
        const state = activeCampaigns.get(campaignId);
        if (!state || !state.running) break;

        const contact = toSend[i];
        const trackingId = uuidv4();

        try {
          const liveServerUrl = "https://damp-tracking-production.up.railway.app";
          const unsubUrl = `${liveServerUrl}/unsubscribe/${encodeURIComponent(contact.email)}`;
          const footer = `<br><br><p style="font-size:11px;color:#999">You received this email because you opted in.<br><a href="${unsubUrl}">Unsubscribe</a></p>`;

          const trackingPixel = settings.trackingEnabled
            ? `<img src="${liveServerUrl}/track/open/${trackingId}" width="1" height="1" border="0" />`
            : "";

          const htmlBody = personalize(campaign.body, contact) + trackingPixel + footer;
          const emailRaw = createMimeMessage(account.email, contact.email, personalize(campaign.subject, contact), htmlBody);
          const encoded = Buffer.from(emailRaw).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

          const response = await gmail.users.messages.send({ userId: "me", requestBody: { raw: encoded } });

          // লগ এবং প্রগ্রেস আপডেট
          await supabase.from("campaign_logs").insert({
            id: uuidv4(), 
            campaign_id: campaignId, 
            contact_id: contact.id,
            email: contact.email, 
            status: "sent", 
            message_id: response.data.id,
            tracking_id: trackingId, 
            sent_at: new Date().toISOString()
          });

          currentSentCount++;
          await supabase.from("campaigns").update({ sent_count: currentSentCount }).eq("id", campaignId);
          
          sendProgress(campaignId, { 
            sent: currentSentCount, 
            total: contacts.length, 
            status: "sending",
            email: contact.email 
          });

          const delay = Math.floor(Math.random() * (settings.maxDelay - settings.minDelay + 1) + settings.minDelay) * 1000;
          await sleep(delay);

        } catch (err) {
          log.error(`ইমেইল ব্যর্থ:`, err.message);
          await logToDb("error", `Failed to send to ${contact.email}: ${err.message}`, campaignId);
          if (err.message.includes("Rate limit") || err.message.includes("quota")) break; 
          await sleep(5000);
        }
      }
      
      activeCampaigns.delete(campaignId);
      await supabase.from("campaigns").update({ status: "completed" }).eq("id", campaignId);
      sendProgress(campaignId, { status: "completed", sent: currentSentCount, total: contacts.length });
    };

    sendLoop();

  } catch (error) {
    log.error("Engine Error:", error.message);
    sendProgress(campaignId, { status: "failed", error: error.message });
  }
}

function pauseCampaignEngine(campaignId) {
  const state = activeCampaigns.get(campaignId);
  if (state) state.running = false;
}

// ৪. পার্সোনালাইজেশন ভেরিয়েবল আপডেট (সবগুলো ভেরিয়েবল সাপোর্ট করবে)
function personalize(text, contact) {
  if (!text) return "";
  return text
    .replace(/\{\{name\}\}/gi, contact.name || "")
    .replace(/\{\{email\}\}/gi, contact.email || "")
    .replace(/\{\{company\}\}/gi, contact.company || "")
    .replace(/\{\{city\}\}/gi, contact.city || "")
    .replace(/\{\{country\}\}/gi, contact.country || "")
    .replace(/\{\{website\}\}/gi, contact.website || "");
}

function createMimeMessage(from, to, subject, htmlBody) {
  return [
    `From: ${from}`,
    `To: ${to}`,
    `Subject: ${subject}`,
    "MIME-Version: 1.0",
    "Content-Type: text/html; charset=UTF-8",
    "",
    htmlBody
  ].join("\r\n");
}

function sleep(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }

module.exports = { startCampaignEngine, pauseCampaignEngine };