const { ipcMain, BrowserWindow, dialog } = require("electron");
const { createClient } = require("@supabase/supabase-js");
const { getAuthUrl, exchangeCodeForTokens, getGmailClient } = require("../../src/services/auth");
const { importContactsFromFile } = require("../../src/services/contacts");
const { startCampaignEngine, pauseCampaignEngine } = require("../../src/services/campaign-engine");
const { syncRepliesForAccount } = require("../../src/services/reply-sync");
const { exportToFile } = require("../../src/services/export");
const { v4: uuidv4 } = require("uuid");
const Store = require("electron-store");
const store = new Store();
const log = require("electron-log");
const http = require("http");
const { google } = require("googleapis");

// ১. সুপাবেস কানেকশন (Service Role Key)
const supabase = createClient(
  "https://jguvvzxwuaomwxqpyzpg.supabase.co",
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpndXZ2enh3dWFvbXd4cXB5enBnIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3Nzg1OTcyNywiZXhwIjoyMDkzNDM1NzI3fQ.RtU0yF8KlMVuk_Z_Rturbkc77vSFXr0yxg4F6fxPEL8"
);

// ── FILE SELECT ───────────────────────────────────────────────
ipcMain.handle("select-file", async () => {
  const result = await dialog.showOpenDialog({
    properties: ["openFile"],
    filters: [{ name: "Spreadsheet", extensions: ["csv", "xlsx", "xls"] }],
  });
  return result.canceled ? null : result.filePaths[0];
});

// ── AUTH ──────────────────────────────────────────────────────
ipcMain.handle("get-auth-url", async () => getAuthUrl());

ipcMain.handle("open-auth-window", async () => {
  return new Promise((resolve) => {
    const config = store.get("googleOAuthConfig", {});
    const oauth2Client = new google.auth.OAuth2(
      config.clientId, config.clientSecret, "http://localhost:42813"
    );
    const authUrl = oauth2Client.generateAuthUrl({
      access_type: "offline", prompt: "consent",
      scope: [
        "https://www.googleapis.com/auth/gmail.send",
        "https://www.googleapis.com/auth/gmail.readonly",
        "https://www.googleapis.com/auth/userinfo.email",
        "https://www.googleapis.com/auth/userinfo.profile",
      ],
    });

    let resolved = false;
    const server = http.createServer(async (req, res) => {
      const url = new URL(req.url, "http://localhost:42813");
      const code = url.searchParams.get("code");
      if (code) {
        resolved = true;
        res.writeHead(200, { "Content-Type": "text/html" });
        res.end("<html><body style='font-family:sans-serif;text-align:center;padding:50px;background:#0f0f1a;color:white'><h2>Login Successful!</h2><p>You can close this window now.</p></body></html>");
        server.close();
        try { authWindow.close(); } catch(e) {}
        try {
          const { tokens } = await oauth2Client.getToken(code);
          oauth2Client.setCredentials(tokens);
          const oauth2 = google.oauth2({ version: "v2", auth: oauth2Client });
          const { data } = await oauth2.userinfo.get();
          resolve({ success: true, tokens, email: data.email, name: data.name });
        } catch (err) { resolve({ success: false, error: err.message }); }
      } else { res.writeHead(200); res.end("OK"); }
    });

    server.listen(42813, "127.0.0.1");
    server.on("error", (err) => resolve({ success: false, error: "Port 42813 busy: " + err.message }));

    const authWindow = new BrowserWindow({
      width: 500, height: 650, title: "Sign in with Google",
      webPreferences: {
        nodeIntegration: false, contextIsolation: true,
        // 🚨 FIXED: Google Login error bypass korar jonno ekdom latest Chrome 147 kora hoyeche
        userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Safari/537.36",
      },
    });
    authWindow.loadURL(authUrl);
    authWindow.on("closed", () => {
      server.close();
      if (!resolved) resolve({ success: false, error: "Window closed by user" });
    });
  });
});

ipcMain.handle("exchange-code", async (_, code) => {
  try {
    const tokens = await exchangeCodeForTokens(code);
    return { success: true, tokens };
  } catch (err) { return { success: false, error: err.message }; }
});

ipcMain.handle("get-oauth-config", async () => store.get("googleOAuthConfig", {}));
ipcMain.handle("save-oauth-config", async (_, data) => {
  store.set("googleOAuthConfig", data);
  return { success: true };
});

// ── ACCOUNTS ──────────────────────────────────────────────────
ipcMain.handle("add-gmail-account", async (_, data) => {
  try {
    const id = uuidv4();
    const { error } = await supabase.from("accounts").upsert({
      id, email: data.email, name: data.name || data.email,
      tokens: JSON.stringify(data.tokens), enabled: 1,
      daily_limit: data.dailyLimit || 400, sent_today: 0, status: "healthy"
    });
    if (error) throw new Error(error.message);
    return { success: true, id };
  } catch (err) { return { success: false, error: err.message }; }
});

ipcMain.handle("get-accounts", async () => {
  const { data, error } = await supabase.from("accounts").select("*").order("created_at", { ascending: false });
  if (error) { log.error("get-accounts error:", error.message); return []; }
  return (data || []).map(r => ({ ...r, tokens: (() => { try { return JSON.parse(r.tokens || "{}"); } catch(e) { return {}; } })() }));
});

ipcMain.handle("remove-account", async (_, id) => {
  await supabase.from("accounts").delete().eq("id", id);
  return { success: true };
});

ipcMain.handle("toggle-account", async (_, id) => {
  const { data } = await supabase.from("accounts").select("enabled").eq("id", id).single();
  if (data) await supabase.from("accounts").update({ enabled: data.enabled ? 0 : 1 }).eq("id", id);
  return { success: true };
});

// ── CONTACTS ──────────────────────────────────────────────────
ipcMain.handle("import-contacts", async (_, filePath) => {
  try {
    return await importContactsFromFile(filePath, getSupabaseDbWrapper());
  } catch (err) { return { success: false, error: err.message }; }
});

ipcMain.handle("get-contacts", async (_, filters) => {
  try {
    let query = supabase.from("contacts").select("*");
    if (filters?.search) query = query.or(`name.ilike.%${filters.search}%,email.ilike.%${filters.search}%,company.ilike.%${filters.search}%`);
    if (filters?.listName) query = query.eq("list_name", filters.listName);
    if (filters?.tag) query = query.ilike("tags", `%${filters.tag}%`);
    if (filters?.country) query = query.eq("country", filters.country);

    query = query.order("created_at", { ascending: false }).limit(1000);
    const { data, error } = await query;
    if (error) throw new Error(error.message);

    const { count } = await supabase.from("contacts").select("*", { count: "exact", head: true });
    const { data: listData } = await supabase.from("contacts").select("list_name").not("list_name", "is", null);
    const allLists = [...new Set((listData || []).map(r => r.list_name).filter(Boolean))];

    return { contacts: data || [], total: count || 0, lists: allLists };
  } catch (err) {
    log.error("get-contacts error:", err.message);
    return { contacts: [], total: 0, lists: [] };
  }
});

ipcMain.handle("delete-contact", async (_, id) => {
  await supabase.from("contacts").delete().eq("id", id);
  return { success: true };
});

ipcMain.handle("add-to-suppression", async (_, email) => {
  try {
    await supabase.from("suppression_list").upsert({ email, reason: "manual" });
    await supabase.from("contacts").update({ status: "suppressed" }).eq("email", email);
    return { success: true };
  } catch (err) { return { success: false, error: err.message }; }
});

ipcMain.handle("get-suppression-list", async () => {
  const { data } = await supabase.from("suppression_list").select("*").order("created_at", { ascending: false });
  return data || [];
});

// ── CAMPAIGNS ─────────────────────────────────────────────────
ipcMain.handle("create-campaign", async (_, data) => {
  try {
    const id = uuidv4();
    const { error } = await supabase.from("campaigns").insert({
      id, name: data.name, subject: data.subject, body: data.body,
      account_id: data.accountId, status: "draft",
      audience_filter: JSON.stringify(data.audienceFilter || {}),
      daily_limit: data.dailyLimit || 100,
      created_at: new Date().toISOString()
    });
    if (error) throw new Error(error.message);
    return { success: true, id };
  } catch (err) { return { success: false, error: err.message }; }
});

ipcMain.handle("get-campaigns", async () => {
  try {
    const { data: campaigns } = await supabase.from("campaigns").select("*").order("created_at", { ascending: false });
    const { data: accounts } = await supabase.from("accounts").select("id, email");
    return (campaigns || []).map(c => {
      const acc = (accounts || []).find(a => a.id === c.account_id);
      return { ...c, account_email: acc?.email || "Not set" };
    });
  } catch (err) {
    log.error("get-campaigns error:", err.message); return [];
  }
});

ipcMain.handle("get-campaign", async (_, id) => {
  const { data } = await supabase.from("campaigns").select("*").eq("id", id).single();
  if (data) data.audienceFilter = (() => { try { return JSON.parse(data.audience_filter || "{}"); } catch(e) { return {}; } })();
  return data;
});

ipcMain.handle("delete-campaign", async (_, id) => {
  await supabase.from("campaigns").delete().eq("id", id);
  return { success: true };
});

ipcMain.handle("start-campaign", async (_, id) => {
  try {
    await startCampaignEngine(id, getSupabaseDbWrapper());
    return { success: true };
  } catch (err) { return { success: false, error: err.message }; }
});

ipcMain.handle("pause-campaign", async (_, id) => {
  pauseCampaignEngine(id);
  await supabase.from("campaigns").update({ status: "paused" }).eq("id", id);
  return { success: true };
});

// ── TEMPLATES ─────────────────────────────────────────────────
ipcMain.handle("save-template", async (_, data) => {
  try {
    const id = data.id || uuidv4();
    let response;
    
    if (data.id) {
      response = await supabase.from("templates")
        .update({ name: data.name, subject: data.subject, body: data.body })
        .eq("id", id);
    } else {
      response = await supabase.from("templates")
        .insert({ id, name: data.name, subject: data.subject, body: data.body });
    }

    if (response.error) throw new Error(response.error.message);
    
    return { success: true, id };
  } catch (err) {
    log.error("Template Save Error:", err.message);
    return { success: false, error: err.message };
  }
});

ipcMain.handle("get-templates", async () => {
  const { data } = await supabase.from("templates").select("*").order("created_at", { ascending: false });
  return data || [];
});

ipcMain.handle("delete-template", async (_, id) => {
  await supabase.from("templates").delete().eq("id", id);
  return { success: true };
});

// ── DASHBOARD STATS ───────────────────────────────────────────
ipcMain.handle("get-dashboard-stats", async () => {
  try {
    const [
      { count: totalContacts }, { count: totalCampaigns }, { count: totalSent },
      { count: totalOpened }, { count: totalReplied }, { data: recentCampaigns },
    ] = await Promise.all([
      supabase.from("contacts").select("*", { count: "exact", head: true }),
      supabase.from("campaigns").select("*", { count: "exact", head: true }),
      supabase.from("campaign_logs").select("*", { count: "exact", head: true }),
      supabase.from("campaign_logs").select("*", { count: "exact", head: true }).eq("status", "opened"),
      supabase.from("replies").select("*", { count: "exact", head: true }),
      supabase.from("campaigns").select("name, status, created_at").order("created_at", { ascending: false }).limit(5),
    ]);

    return {
      totalContacts: totalContacts || 0, totalCampaigns: totalCampaigns || 0,
      totalSent: totalSent || 0, totalOpened: totalOpened || 0,
      totalReplied: totalReplied || 0, totalBounced: 0,
      recentCampaigns: recentCampaigns || [], dailySent: [],
    };
  } catch (err) {
    log.error("get-dashboard-stats error:", err.message);
    return { totalContacts: 0, totalCampaigns: 0, totalSent: 0, totalOpened: 0, totalReplied: 0, totalBounced: 0, recentCampaigns: [], dailySent: [] };
  }
});

// ── ANALYTICS ─────────────────────────────────────────────────
ipcMain.handle("get-campaign-analytics", async (_, id) => {
  const { data: campaign } = await supabase.from("campaigns").select("*").eq("id", id).single();
  const { data: logs } = await supabase.from("campaign_logs").select("*").eq("campaign_id", id).order("sent_at", { ascending: false }).limit(500);
  const { data: statsRaw } = await supabase.from("campaign_logs").select("status").eq("campaign_id", id);
  const statsMap = {};
  (statsRaw || []).forEach(r => { statsMap[r.status] = (statsMap[r.status] || 0) + 1; });
  return { campaign, logs: logs || [], stats: Object.entries(statsMap).map(([status, count]) => ({ status, count })) };
});

// ── REPLIES ───────────────────────────────────────────────────
ipcMain.handle("get-replies", async (_, filters) => {
  let query = supabase.from("replies").select("*");
  if (filters?.tag) query = query.eq("tag", filters.tag);
  if (filters?.search) query = query.or(`subject.ilike.%${filters.search}%,from_email.ilike.%${filters.search}%`);
  const { data } = await query.order("received_at", { ascending: false }).limit(200);
  return data || [];
});

ipcMain.handle("tag-reply", async (_, id, tag) => {
  await supabase.from("replies").update({ tag }).eq("id", id);
  return { success: true };
});

ipcMain.handle("sync-replies", async (_, accountId) => {
  try {
    const count = await syncRepliesForAccount(accountId, getSupabaseDbWrapper());
    return { success: true, count };
  } catch (err) { return { success: false, error: err.message }; }
});

// ── FOLLOW-UPS ────────────────────────────────────────────────
ipcMain.handle("create-followup", async (_, data) => {
  const id = uuidv4();
  await supabase.from("followups").insert({
    id, campaign_id: data.campaignId, step: data.step || 1,
    subject: data.subject, body: data.body,
    delay_days: data.delayDays || 3, stop_on_reply: data.stopOnReply ? 1 : 0,
  });
  return { success: true, id };
});

ipcMain.handle("get-followups", async (_, campaignId) => {
  const { data } = await supabase.from("followups").select("*").eq("campaign_id", campaignId).order("step");
  return data || [];
});

// ── SETTINGS ──────────────────────────────────────────────────
ipcMain.handle("get-settings", async () => {
  return store.get("settings", {
    defaultDailyLimit: 400, minDelay: 30, maxDelay: 120,
    timezone: "UTC", companyName: "My Company",
    footerText: "You are receiving this email because you opted in.",
    unsubscribeText: "Unsubscribe", trackingEnabled: true,
  });
});

ipcMain.handle("save-settings", async (_, data) => {
  store.set("settings", data); return { success: true };
});

// ── EXPORT ────────────────────────────────────────────────────
ipcMain.handle("export-data", async (_, type, data) => {
  try { return await exportToFile(type, data, dialog); }
  catch (err) { return { success: false, error: err.message }; }
});

// ── LOGS ──────────────────────────────────────────────────────
ipcMain.handle("get-logs", async () => {
  const { data } = await supabase.from("send_logs").select("*").order("created_at", { ascending: false }).limit(500);
  return data || [];
});

// ── Supabase DB Wrapper (স্মার্ট র‍্যাপার ফর ক্যাম্পেইন ইঞ্জিন) ──
function getSupabaseDbWrapper() {
  return {
    supabase,
    prepare: (sql) => ({
      all: async (...params) => {
        const table = extractTable(sql);
        let query = supabase.from(table).select("*");
        const conditions = extractConditions(sql, params);
        conditions.forEach(c => { query = query.eq(c.col, c.val); });
        const { data } = await query; return data || [];
      },
      get: async (...params) => {
        const table = extractTable(sql);
        let query = supabase.from(table).select("*");
        const conditions = extractConditions(sql, params);
        conditions.forEach(c => { query = query.eq(c.col, c.val); });
        const { data } = await query.limit(1).maybeSingle(); return data || undefined;
      },
      run: async (...params) => {
        const table = extractTable(sql);
        const sqlLower = sql.toLowerCase().trim();
        if (sqlLower.startsWith("insert")) {
          await supabase.from(table).upsert(buildInsertObject(sql, params));
        } else if (sqlLower.startsWith("update")) {
          const { updates, conditions } = buildUpdateObject(sql, params);
          let query = supabase.from(table).update(updates);
          conditions.forEach(c => { query = query.eq(c.col, c.val); });
          await query;
        } else if (sqlLower.startsWith("delete")) {
          const conditions = extractConditions(sql, params);
          let query = supabase.from(table).delete();
          conditions.forEach(c => { query = query.eq(c.col, c.val); });
          await query;
        }
        return { changes: 1 };
      },
    }),
    exec: async () => {},
    transaction: (fn) => (...args) => fn(...args),
  };
}

function extractTable(sql) {
  const lower = sql.toLowerCase();
  let match = lower.match(/from\s+(\w+)/) || lower.match(/into\s+(\w+)/) || lower.match(/update\s+(\w+)/);
  return match ? match[1] : "";
}

function extractConditions(sql, params) {
  const conditions = [];
  const whereMatch = sql.match(/WHERE\s+(.+?)(?:\s+ORDER|\s+LIMIT|$)/i);
  if (!whereMatch) return conditions;
  const parts = whereMatch[1].split(/\s+AND\s+/i);
  let idx = 0;
  parts.forEach(part => {
    const m = part.match(/(\w+)\s*=\s*\?/i);
    if (m && idx < params.length) { conditions.push({ col: m[1], val: params[idx] }); idx++; }
  });
  return conditions;
}

function buildInsertObject(sql, params) {
  const colMatch = sql.match(/\(([^)]+)\)\s+VALUES/i);
  if (!colMatch) return {};
  const cols = colMatch[1].split(",").map(c => c.trim());
  const obj = {};
  cols.forEach((col, i) => { if (params[i] !== undefined) obj[col] = params[i]; });
  return obj;
}

function buildUpdateObject(sql, params) {
  const setMatch = sql.match(/SET\s+(.+?)\s+WHERE/i);
  const whereMatch = sql.match(/WHERE\s+(.+?)(?:\s+ORDER|\s+LIMIT|$)/i);
  const updates = {}, conditions = [];
  if (setMatch) {
    setMatch[1].split(",").forEach((part, i) => {
      const m = part.match(/(\w+)\s*=\s*\?/i);
      if (m && params[i] !== undefined) updates[m[1]] = params[i];
    });
  }
  const setCount = Object.keys(updates).length;
  if (whereMatch) {
    whereMatch[1].split(/\s+AND\s+/i).forEach((part, i) => {
      const m = part.match(/(\w+)\s*=\s*\?/i);
      if (m && params[setCount + i] !== undefined) conditions.push({ col: m[1], val: params[setCount + i] });
    });
  }
  return { updates, conditions };
}

// ── OAuth Config Supabase Sync ────────────────────────────────
ipcMain.handle("get-oauth-config-from-supabase", async () => {
  try {
    const { data } = await supabase.from("app_config").select("value").eq("key", "oauth_config").single();
    return data ? JSON.parse(data.value) : null;
  } catch (err) { return null; }
});

ipcMain.handle("save-oauth-config-to-supabase", async (_, config) => {
  try {
    await supabase.from("app_config").upsert({ key: "oauth_config", value: JSON.stringify(config) });
    return { success: true };
  } catch (err) { return { success: false, error: err.message }; }
});
