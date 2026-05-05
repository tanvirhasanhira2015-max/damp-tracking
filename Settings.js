import React, { useState, useEffect } from "react";

const Section = ({ title, children }) => (
  <div className="card" style={{ marginBottom: 16 }}>
    <h3 style={{ fontSize: 14, fontWeight: 700, color: "var(--text-primary)", marginBottom: 16, paddingBottom: 10, borderBottom: "1px solid var(--border)" }}>
      {title}
    </h3>
    {children}
  </div>
);

export default function Settings() {
  const [settings, setSettings] = useState({
    defaultDailyLimit: 400,
    minDelay: 30,
    maxDelay: 120,
    timezone: "Asia/Dhaka", // ডিফল্ট টাইমজোন এখন বাংলাদেশ
    companyName: "",
    footerText: "You are receiving this email because you opted in.",
    unsubscribeText: "Unsubscribe",
    trackingEnabled: true,
  });
  const [oauthConfig, setOauthConfig] = useState({ clientId: "", clientSecret: "" });
  const [msg, setMsg] = useState(null);

  useEffect(() => {
    loadSettings();
    const stored = localStorage.getItem("googleOAuthConfig");
    if (stored) setOauthConfig(JSON.parse(stored));
  }, []);

  const loadSettings = async () => {
    if (!window.electronAPI) return;
    const data = await window.electronAPI.getSettings();
    setSettings(data);
  };

  const handleSave = async () => {
    if (!window.electronAPI) return;
    const result = await window.electronAPI.saveSettings(settings);
    if (result.success) {
      setMsg({ type: "success", text: "Settings saved successfully!" });
      localStorage.setItem("googleOAuthConfig", JSON.stringify(oauthConfig));
    } else {
      setMsg({ type: "error", text: "Failed to save settings" });
    }
    setTimeout(() => setMsg(null), 3000);
  };

  return (
    <div className="page fade-in">
      <div className="page-header flex justify-between items-center">
        <div>
          <h1 className="page-title">Settings</h1>
          <p className="page-subtitle">Configure application preferences</p>
        </div>
        <button className="btn btn-primary" onClick={handleSave}>
          Save Settings
        </button>
      </div>

      {msg && <div className={`alert alert-${msg.type}`}>{msg.text}</div>}

      <Section title="Google OAuth Credentials">
        <div className="alert alert-info" style={{ marginBottom: 16 }}>
          Get credentials from <strong>console.cloud.google.com</strong> - APIs and Services - Credentials - OAuth 2.0 Client IDs - Application type: Desktop
        </div>
        <div className="grid-2">
          <div className="form-group">
            <label className="form-label">Client ID</label>
            <input
              className="form-input"
              placeholder="Your Google Client ID"
              value={oauthConfig.clientId}
              onChange={(e) => setOauthConfig({ ...oauthConfig, clientId: e.target.value })}
            />
          </div>
          <div className="form-group">
            <label className="form-label">Client Secret</label>
            <input
              className="form-input"
              type="password"
              placeholder="Your Google Client Secret"
              value={oauthConfig.clientSecret}
              onChange={(e) => setOauthConfig({ ...oauthConfig, clientSecret: e.target.value })}
            />
          </div>
        </div>
      </Section>

      <Section title="Sending Limits">
        <div className="grid-3">
          <div className="form-group">
            <label className="form-label">Default Daily Limit</label>
            <input
              className="form-input"
              type="number" min="1" max="2000"
              value={settings.defaultDailyLimit}
              onChange={(e) => setSettings({ ...settings, defaultDailyLimit: parseInt(e.target.value) })}
            />
            <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 4 }}>
              Gmail recommends max 500/day
            </div>
          </div>
          <div className="form-group">
            <label className="form-label">Min Delay (seconds)</label>
            <input
              className="form-input"
              type="number" min="5" max="300"
              value={settings.minDelay}
              onChange={(e) => setSettings({ ...settings, minDelay: parseInt(e.target.value) })}
            />
          </div>
          <div className="form-group">
            <label className="form-label">Max Delay (seconds)</label>
            <input
              className="form-input"
              type="number" min="10" max="600"
              value={settings.maxDelay}
              onChange={(e) => setSettings({ ...settings, maxDelay: parseInt(e.target.value) })}
            />
          </div>
        </div>
        <div className="alert alert-warning">
          Delays between emails simulate human behavior and improve deliverability. Recommended: 30-120 seconds.
        </div>
      </Section>

      <Section title="Branding">
        <div className="form-group">
          <label className="form-label">Company Name</label>
          <input
            className="form-input"
            placeholder="Your Company Name"
            value={settings.companyName}
            onChange={(e) => setSettings({ ...settings, companyName: e.target.value })}
          />
        </div>
        <div className="form-group">
          <label className="form-label">Email Footer Text</label>
          <textarea
            className="form-textarea"
            style={{ minHeight: 80 }}
            value={settings.footerText}
            onChange={(e) => setSettings({ ...settings, footerText: e.target.value })}
          />
        </div>
        <div className="grid-2">
          <div className="form-group">
            <label className="form-label">Unsubscribe Link Text</label>
            <input
              className="form-input"
              placeholder="Unsubscribe"
              value={settings.unsubscribeText}
              onChange={(e) => setSettings({ ...settings, unsubscribeText: e.target.value })}
            />
          </div>
          <div className="form-group">
            <label className="form-label">Timezone</label>
            <select
              className="form-select"
              value={settings.timezone}
              onChange={(e) => setSettings({ ...settings, timezone: e.target.value })}
            >
              {/* Asia/Dhaka যোগ করা হলো */}
              {["UTC","America/New_York","America/Chicago","America/Los_Angeles","Europe/London","Europe/Paris","Asia/Tokyo","Asia/Dhaka","Australia/Sydney"].map((tz) => (
                <option key={tz} value={tz}>{tz}</option>
              ))}
            </select>
          </div>
        </div>
      </Section>

      <Section title="Tracking">
        <div className="form-group">
          <label style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer" }}>
            <input
              type="checkbox"
              checked={settings.trackingEnabled}
              onChange={(e) => setSettings({ ...settings, trackingEnabled: e.target.checked })}
            />
            <div>
              <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)" }}>
                Enable Open Tracking
              </div>
              <div style={{ fontSize: 12, color: "var(--text-muted)" }}>
                Inserts a 1x1 pixel to track when emails are opened
              </div>
            </div>
          </label>
        </div>
      </Section>

      <Section title="Compliance Notice">
        <div className="alert alert-warning">
          <strong>Important:</strong> Only send emails to opted-in recipients. All emails include an automatic unsubscribe link. This application uses official Gmail APIs only.
        </div>
      </Section>
    </div>
  );
}