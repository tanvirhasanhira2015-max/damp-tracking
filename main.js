const { app, BrowserWindow, ipcMain, shell, dialog } = require("electron");
const path = require("path");
const { createClient } = require("@supabase/supabase-js");
const log = require("electron-log");

// ১. সুপাবেস কানেকশন (Service Role Key)
const supabaseUrl = "https://jguvvzxwuaomwxqpyzpg.supabase.co";
const supabaseKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpndXZ2enh3dWFvbXd4cXB5enBnIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3Nzg1OTcyNywiZXhwIjoyMDkzNDM1NzI3fQ.RtU0yF8KlMVuk_Z_Rturbkc77vSFXr0yxg4F6fxPEL8";
const supabase = createClient(supabaseUrl, supabaseKey);

log.transports.file.level = "info";
log.info("App starting with Lock System...");

let mainWindow;
let heartbeatInterval;

async function claimAppLock(userName) {
  try {
    const { data: lock } = await supabase.from("app_lock").select("*").eq("id", 1).single();
    if (lock && lock.is_occupied) {
      const lastPing = new Date(lock.last_ping);
      const now = new Date();
      const diffInSeconds = (now - lastPing) / 1000;
      if (diffInSeconds < 120) return { success: false, currentUser: lock.user_name };
    }
    await supabase.from("app_lock").update({
      is_occupied: true, user_name: userName, last_ping: new Date().toISOString()
    }).eq("id", 1);

    heartbeatInterval = setInterval(async () => {
      await supabase.from("app_lock").update({ last_ping: new Date().toISOString() }).eq("id", 1);
    }, 60000);
    return { success: true };
  } catch (err) {
    log.error("Lock error:", err);
    return { success: true };
  }
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400, height: 900, minWidth: 1200, minHeight: 700,
    frame: false, titleBarStyle: "hidden", backgroundColor: "#0f0f1a",
    webPreferences: {
      nodeIntegration: false, contextIsolation: true,
      preload: path.join(__dirname, "preload.js"),
    },
  });
  mainWindow.loadFile(path.join(__dirname, "../../build/index.html"));
  mainWindow.on("closed", () => { mainWindow = null; });
}

app.on("ready", async () => {
  try {
    const myName = "Azmir"; // বন্ধুর জন্য Azmir লিখে দেবেন
    const lockStatus = await claimAppLock(myName);
    if (!lockStatus.success) {
      dialog.showErrorBox("Access Denied", `${lockStatus.currentUser} বর্তমানে অ্যাপটি ব্যবহার করছেন।`);
      app.quit(); return;
    }
    const { initDatabase } = require("../../src/database/init");
    global.db = await initDatabase();
    createWindow();
    require("./ipc-handlers");
  } catch (err) { log.error("Startup error:", err); }
});

ipcMain.on("window-minimize", () => mainWindow && mainWindow.minimize());
ipcMain.on("window-maximize", () => {
  if (mainWindow) mainWindow.isMaximized() ? mainWindow.unmaximize() : mainWindow.maximize();
});
ipcMain.on("window-close", () => mainWindow && mainWindow.close());
ipcMain.on("open-external", (event, url) => shell.openExternal(url));

app.on("will-quit", async () => {
  if (heartbeatInterval) clearInterval(heartbeatInterval);
  await supabase.from("app_lock").update({ is_occupied: false }).eq("id", 1);
});

app.on("window-all-closed", () => { if (process.platform !== "darwin") app.quit(); });
