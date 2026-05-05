import React, { useState, useEffect } from "react";

const StatusBadge = ({ status }) => (
  <span className={`badge badge-${status}`}>{status}</span>
);

export default function Campaigns() {
  const [campaigns, setCampaigns] = useState([]);
  const [accounts, setAccounts] = useState([]);
  const [templates, setTemplates] = useState([]);
  const [lists, setLists] = useState([]);
  const [showModal, setShowModal] = useState(false);
  const [showFollowUpModal, setShowFollowUpModal] = useState(false);
  const [selectedCampaign, setSelectedCampaign] = useState(null);
  const [progress, setProgress] = useState({});
  const [msg, setMsg] = useState(null);
  const [form, setForm] = useState({
    name: "", subject: "", body: "", accountId: "",
    selectedAccounts: [],
    dailyLimit: 100,
    audienceFilter: { tags: "", country: "", listName: "" },
  });
  const [followUpForm, setFollowUpForm] = useState({
    subject: "", body: "", delayDays: 3, step: 1, stopOnReply: true
  });

  useEffect(() => {
    loadCampaigns();
    loadAccounts();
    loadTemplates();
    loadLists();
    if (window.electronAPI) {
      window.electronAPI.on("campaign-progress", (data) => {
        setProgress((prev) => ({ ...prev, [data.campaignId]: data }));
        loadCampaigns();
      });
    }
    return () => {
      if (window.electronAPI) window.electronAPI.off("campaign-progress");
    };
  }, []);

  const loadCampaigns = async () => {
    if (!window.electronAPI) return;
    const data = await window.electronAPI.getCampaigns();
    setCampaigns(data || []);
  };

  const loadAccounts = async () => {
    if (!window.electronAPI) return;
    const data = await window.electronAPI.getAccounts();
    setAccounts((data || []).filter((a) => a.enabled));
  };

  const loadTemplates = async () => {
    if (!window.electronAPI) return;
    const data = await window.electronAPI.getTemplates();
    setTemplates(data || []);
  };

const loadLists = async () => {
    if (!window.electronAPI) return;
    const data = await window.electronAPI.getContacts({ search: "", listName: "" });
    const allContacts = data?.contacts || [];
    const uniqueLists = [...new Set(allContacts.map(c => c.list_name).filter(Boolean))];
    setLists(uniqueLists);
  };

  const resetForm = () =>
    setForm({
      name: "", subject: "", body: "", accountId: "",
      selectedAccounts: [],
      dailyLimit: 100,
      audienceFilter: { tags: "", country: "", listName: "" },
    });

  const toggleAccountSelect = (id) => {
    setForm((f) => {
      const already = f.selectedAccounts.includes(id);
      const newAccounts = already
        ? f.selectedAccounts.filter((a) => a !== id)
        : [...f.selectedAccounts, id];
      return {
        ...f,
        selectedAccounts: newAccounts,
        accountId: newAccounts[0] || ""
      };
    });
  };

  const handleCreate = async () => {
    const accountId = form.selectedAccounts[0] || form.accountId;
    if (!form.name || !form.subject || !form.body || !accountId) {
      setMsg({ type: "error", text: "Please fill all required fields" });
      return;
    }
    const result = await window.electronAPI.createCampaign({
      ...form,
      accountId,
      audienceFilter: form.audienceFilter
    });
    if (result.success) {
      setMsg({ type: "success", text: "Campaign created!" });
      setShowModal(false);
      resetForm();
      loadCampaigns();
    } else {
      setMsg({ type: "error", text: result.error });
    }
    setTimeout(() => setMsg(null), 4000);
  };

  const handleStart = async (id) => {
    const result = await window.electronAPI.startCampaign(id);
    if (result.success) {
      setMsg({ type: "success", text: "Campaign started!" });
      loadCampaigns();
    } else {
      setMsg({ type: "error", text: result.error });
    }
    setTimeout(() => setMsg(null), 4000);
  };

  const handlePause = async (id) => {
    await window.electronAPI.pauseCampaign(id);
    loadCampaigns();
  };

  const handleDelete = async (id) => {
    if (window.confirm("Delete this campaign and all its data?")) {
      await window.electronAPI.deleteCampaign(id);
      loadCampaigns();
    }
  };

  const applyTemplate = (templateId) => {
    const tpl = templates.find((t) => t.id === templateId);
    if (tpl) setForm((f) => ({ ...f, subject: tpl.subject, body: tpl.body }));
  };

  const handleAddFollowUp = async () => {
    if (!selectedCampaign) return;
    const result = await window.electronAPI.createFollowUp({
      ...followUpForm,
      campaignId: selectedCampaign.id,
    });
    if (result.success) {
      setMsg({ type: "success", text: "Follow-up added!" });
      setShowFollowUpModal(false);
    }
    setTimeout(() => setMsg(null), 3000);
  };

  // লোকাল টাইম কনভার্ট করার ফাংশন যোগ করা হলো
  const formatDateTime = (dateString) => {
    if (!dateString) return "Date not set";
    const str = dateString.includes('Z') || dateString.includes('+') ? dateString : dateString + 'Z';
    return new Date(str).toLocaleString('en-GB', {
      day: '2-digit', month: '2-digit', year: 'numeric',
      hour: '2-digit', minute: '2-digit', hour12: true
    });
  };

  return (
    <div className="page fade-in">
      <div className="page-header flex justify-between items-center">
        <div>
          <h1 className="page-title">Campaigns</h1>
          <p className="page-subtitle">Create and manage your email campaigns</p>
        </div>
        <button
          className="btn btn-primary"
          onClick={() => { setShowModal(true); setMsg(null); resetForm(); }}
        >
          + New Campaign
        </button>
      </div>

      {msg && <div className={`alert alert-${msg.type}`}>{msg.text}</div>}

      {campaigns.length === 0 ? (
        <div className="card">
          <div className="empty-state">
            <div className="empty-state-title">No campaigns yet</div>
            <div className="empty-state-text">Create your first campaign to start sending emails</div>
          </div>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {campaigns.map((c) => {
            const prog = progress[c.id];
            const pct = c.total_recipients > 0
              ? Math.min(((c.sent_count || 0) / c.total_recipients) * 100, 100) : 0;
            return (
              <div key={c.id} className="card">
                <div className="flex justify-between items-center" style={{ marginBottom: 12 }}>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 15, color: "var(--text-primary)" }}>{c.name}</div>
                    <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 2 }}>
                      Subject: {c.subject} | Account: {c.account_email || "Not set"}
                    </div>
                    {/* সঠিক লোকাল সময় বসানো হলো */}
                    <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 4 }}>
                      📅 Created: {formatDateTime(c.created_at)}
                    </div>
                  </div>
                  <StatusBadge status={c.status} />
                </div>
                <div className="grid-3" style={{ marginBottom: 12 }}>
                  <div style={{ fontSize: 12, color: "var(--text-muted)" }}>
                    Sent: <strong style={{ color: "var(--text-primary)" }}>{c.sent_count || 0}</strong>
                  </div>
                  <div style={{ fontSize: 12, color: "var(--text-muted)" }}>
                    Opens: <strong style={{ color: "var(--success)" }}>{c.total_opened || 0}</strong>
                  </div>
                  <div style={{ fontSize: 12, color: "var(--text-muted)" }}>
                    Recipients: <strong style={{ color: "var(--text-primary)" }}>{c.total_recipients || 0}</strong>
                  </div>
                </div>
                {(c.status === "running" || c.status === "completed") && (
                  <div style={{ marginBottom: 12 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: "var(--text-muted)", marginBottom: 4 }}>
                      <span>Progress</span><span>{pct.toFixed(0)}%</span>
                    </div>
                    <div className="progress-bar">
                      <div className="progress-fill" style={{ width: `${pct}%` }} />
                    </div>
                    {prog && prog.status === "sending" && (
                      <div style={{ fontSize: 11, color: "var(--accent)", marginTop: 4 }} className="pulse">
                        Sending to {prog.email}...
                      </div>
                    )}
                  </div>
                )}
                <div className="flex gap-8">
                  {(c.status === "draft" || c.status === "paused") && (
                    <button className="btn btn-success btn-sm" onClick={() => handleStart(c.id)}>Start</button>
                  )}
                  {c.status === "running" && (
                    <button className="btn btn-secondary btn-sm" onClick={() => handlePause(c.id)}>Pause</button>
                  )}
                  <button className="btn btn-secondary btn-sm" onClick={() => { setSelectedCampaign(c); setShowFollowUpModal(true); }}>
                    + Follow-up
                  </button>
                  <button className="btn btn-danger btn-sm" onClick={() => handleDelete(c.id)}>Delete</button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Create Modal */}
      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal" style={{ maxWidth: 700 }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2 className="modal-title">New Campaign</h2>
              <button className="modal-close" onClick={() => setShowModal(false)}>X</button>
            </div>

            {msg && <div className={`alert alert-${msg.type}`}>{msg.text}</div>}

            <div className="form-group">
              <label className="form-label">Campaign Name *</label>
              <input
                className="form-input"
                placeholder="e.g. Product Launch Q1"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
            </div>

            <div className="form-group">
              <label className="form-label">Gmail Accounts * (select one or more)</label>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                {accounts.map((a) => (
                  <div
                    key={a.id}
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => toggleAccountSelect(a.id)}
                    style={{
                      padding: "6px 12px",
                      borderRadius: 6,
                      border: form.selectedAccounts.includes(a.id)
                        ? "2px solid var(--accent)"
                        : "1px solid rgba(255,255,255,0.1)",
                      background: form.selectedAccounts.includes(a.id)
                        ? "rgba(99,102,241,0.2)"
                        : "var(--bg-secondary)",
                      cursor: "pointer",
                      fontSize: 12,
                      color: form.selectedAccounts.includes(a.id)
                        ? "var(--accent)"
                        : "var(--text-secondary)",
                    }}
                  >
                    {a.email}
                  </div>
                ))}
              </div>
              {form.selectedAccounts.length > 0 && (
                <div style={{ fontSize: 11, color: "var(--success)", marginTop: 4 }}>
                  {form.selectedAccounts.length} account(s) selected - {form.selectedAccounts.length * form.dailyLimit} emails/day total
                </div>
              )}
            </div>

            <div className="form-group">
              <label className="form-label">Use Template</label>
              <select className="form-select" onChange={(e) => applyTemplate(e.target.value)} defaultValue="">
                <option value="">Select a template...</option>
                {templates.map((t) => (
                  <option key={t.id} value={t.id}>{t.name}</option>
                ))}
              </select>
            </div>

            <div className="form-group">
              <label className="form-label">Subject Line *</label>
              <input
                className="form-input"
                placeholder="e.g. Hi {{name}}, quick question about {{company}}"
                value={form.subject}
                onChange={(e) => setForm({ ...form, subject: e.target.value })}
              />
            </div>

            <div className="form-group">
              <label className="form-label">Email Body * (HTML supported)</label>
              <textarea
                className="form-textarea"
                style={{ minHeight: 160 }}
                placeholder="Hi {{name}}, ..."
                value={form.body}
                onChange={(e) => setForm({ ...form, body: e.target.value })}
              />
              <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 4 }}>
                Variables: name, email, company, city, country, website
              </div>
            </div>

            {/* Contact List Group Selection */}
            <div className="form-group">
              <label className="form-label">Select Contact List (leave blank for all)</label>
              <select
                className="form-select"
                value={form.audienceFilter.listName}
                onChange={(e) => setForm({
                  ...form,
                  audienceFilter: { ...form.audienceFilter, listName: e.target.value }
                })}
              >
                <option value="">All Contacts</option>
                {lists.map(l => (
                  <option key={l} value={l}>{l}</option>
                ))}
              </select>
              {form.audienceFilter.listName && (
                <div style={{ fontSize: 11, color: "var(--success)", marginTop: 4 }}>
                  Only contacts from "{form.audienceFilter.listName}" list will receive this campaign
                </div>
              )}
            </div>

            <div className="grid-2">
              <div className="form-group">
                <label className="form-label">Daily Send Limit (per account)</label>
                <input
                  className="form-input"
                  type="number" min="1" max="500"
                  value={form.dailyLimit}
                  onChange={(e) => setForm({ ...form, dailyLimit: parseInt(e.target.value) })}
                />
              </div>
              <div className="form-group">
                <label className="form-label">Filter by Tag</label>
                <input
                  className="form-input"
                  placeholder="e.g. leads, prospects"
                  value={form.audienceFilter.tags}
                  onChange={(e) => setForm({ ...form, audienceFilter: { ...form.audienceFilter, tags: e.target.value } })}
                />
              </div>
            </div>

            <div className="form-group">
              <label className="form-label">Filter by Country</label>
              <input
                className="form-input"
                placeholder="e.g. US, UK (leave blank for all)"
                value={form.audienceFilter.country}
                onChange={(e) => setForm({ ...form, audienceFilter: { ...form.audienceFilter, country: e.target.value } })}
              />
            </div>

            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setShowModal(false)}>Cancel</button>
              <button className="btn btn-primary" onClick={handleCreate}>Create Campaign</button>
            </div>
          </div>
        </div>
      )}

      {/* Follow-up Modal */}
      {showFollowUpModal && (
        <div className="modal-overlay" onClick={() => setShowFollowUpModal(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2 className="modal-title">Add Follow-up</h2>
              <button className="modal-close" onClick={() => setShowFollowUpModal(false)}>X</button>
            </div>
            <div className="form-group">
              <label className="form-label">Follow-up Subject</label>
              <input
                className="form-input"
                placeholder="Following up on my previous email..."
                value={followUpForm.subject}
                onChange={(e) => setFollowUpForm({ ...followUpForm, subject: e.target.value })}
              />
            </div>
            <div className="form-group">
              <label className="form-label">Follow-up Body</label>
              <textarea
                className="form-textarea"
                placeholder="Hi {{name}}, just following up..."
                value={followUpForm.body}
                onChange={(e) => setFollowUpForm({ ...followUpForm, body: e.target.value })}
              />
            </div>
            <div className="grid-2">
              <div className="form-group">
                <label className="form-label">Delay (Days)</label>
                <input
                  className="form-input"
                  type="number" min="1" max="30"
                  value={followUpForm.delayDays}
                  onChange={(e) => setFollowUpForm({ ...followUpForm, delayDays: parseInt(e.target.value) })}
                />
              </div>
              <div className="form-group">
                <label className="form-label">Step Number</label>
                <input
                  className="form-input"
                  type="number" min="1" max="10"
                  value={followUpForm.step}
                  onChange={(e) => setFollowUpForm({ ...followUpForm, step: parseInt(e.target.value) })}
                />
              </div>
            </div>
            <div className="form-group">
              <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", fontSize: 13, color: "var(--text-secondary)" }}>
                <input
                  type="checkbox"
                  checked={followUpForm.stopOnReply}
                  onChange={(e) => setFollowUpForm({ ...followUpForm, stopOnReply: e.target.checked })}
                />
                Stop sending follow-ups if recipient replies
              </label>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setShowFollowUpModal(false)}>Cancel</button>
              <button className="btn btn-primary" onClick={handleAddFollowUp}>Add Follow-up</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}