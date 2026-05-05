const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("electronAPI", {
  // Window controls
  minimizeWindow: () => ipcRenderer.send("window-minimize"),
  maximizeWindow: () => ipcRenderer.send("window-maximize"),
  closeWindow: () => ipcRenderer.send("window-close"),
  openExternal: (url) => ipcRenderer.send("open-external", url),

  // Accounts
  addGmailAccount: (data) => ipcRenderer.invoke("add-gmail-account", data),
  getAccounts: () => ipcRenderer.invoke("get-accounts"),
  removeAccount: (id) => ipcRenderer.invoke("remove-account", id),
  toggleAccount: (id) => ipcRenderer.invoke("toggle-account", id),
  getAuthUrl: () => ipcRenderer.invoke("get-auth-url"),
  openAuthWindow: () => ipcRenderer.invoke("open-auth-window"),
  exchangeCode: (code) => ipcRenderer.invoke("exchange-code", code),

  // Contacts
  importContacts: (filePath) => ipcRenderer.invoke("import-contacts", filePath),
  getContacts: (filters) => ipcRenderer.invoke("get-contacts", filters),
  deleteContact: (id) => ipcRenderer.invoke("delete-contact", id),
  addToSuppression: (email) => ipcRenderer.invoke("add-to-suppression", email),
  getSuppressionList: () => ipcRenderer.invoke("get-suppression-list"),
  selectFile: () => ipcRenderer.invoke("select-file"),

  // Campaigns
  createCampaign: (data) => ipcRenderer.invoke("create-campaign", data),
  getCampaigns: () => ipcRenderer.invoke("get-campaigns"),
  getCampaign: (id) => ipcRenderer.invoke("get-campaign", id),
  updateCampaign: (id, data) => ipcRenderer.invoke("update-campaign", id, data),
  deleteCampaign: (id) => ipcRenderer.invoke("delete-campaign", id),
  startCampaign: (id) => ipcRenderer.invoke("start-campaign", id),
  pauseCampaign: (id) => ipcRenderer.invoke("pause-campaign", id),

  // Templates
  saveTemplate: (data) => ipcRenderer.invoke("save-template", data),
  getTemplates: () => ipcRenderer.invoke("get-templates"),
  deleteTemplate: (id) => ipcRenderer.invoke("delete-template", id),

  // Analytics
  getDashboardStats: () => ipcRenderer.invoke("get-dashboard-stats"),
  getCampaignAnalytics: (id) => ipcRenderer.invoke("get-campaign-analytics", id),

  // Replies
  getReplies: (filters) => ipcRenderer.invoke("get-replies", filters),
  tagReply: (id, tag) => ipcRenderer.invoke("tag-reply", id, tag),
  syncReplies: (accountId) => ipcRenderer.invoke("sync-replies", accountId),

  // Follow-ups
  createFollowUp: (data) => ipcRenderer.invoke("create-followup", data),
  getFollowUps: (campaignId) => ipcRenderer.invoke("get-followups", campaignId),

  // Settings
  getSettings: () => ipcRenderer.invoke("get-settings"),
  saveSettings: (data) => ipcRenderer.invoke("save-settings", data),
  saveOAuthConfig: (data) => ipcRenderer.invoke("save-oauth-config", data),
  getOAuthConfig: () => ipcRenderer.invoke("get-oauth-config"),

  // OAuth Supabase Sync
  getOAuthConfigFromSupabase: () => ipcRenderer.invoke("get-oauth-config-from-supabase"),
  saveOAuthConfigToSupabase: (config) => ipcRenderer.invoke("save-oauth-config-to-supabase", config),

  // Export
  exportData: (type, data) => ipcRenderer.invoke("export-data", type, data),

  // Logs
  getLogs: () => ipcRenderer.invoke("get-logs"),

  // Events
  on: (channel, callback) => {
    const validChannels = ["campaign-progress", "send-log", "error-alert"];
    if (validChannels.includes(channel)) {
      ipcRenderer.on(channel, (event, ...args) => callback(...args));
    }
  },
  off: (channel) => ipcRenderer.removeAllListeners(channel),
});