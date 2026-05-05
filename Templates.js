import React, { useState, useEffect } from "react";

export default function Templates() {
  const [templates, setTemplates] = useState([]);
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({ name: "", subject: "", body: "" });
  const [msg, setMsg] = useState(null);
  const [preview, setPreview] = useState(null);

  useEffect(() => { loadTemplates(); }, []);

  const loadTemplates = async () => {
    const data = await window.electronAPI.getTemplates();
    setTemplates(data || []);
  };

  const openCreate = () => {
    setEditing(null);
    setForm({ name: "", subject: "", body: "" });
    setShowModal(true);
    setMsg(null);
  };

  const openEdit = (tpl) => {
    setEditing(tpl);
    setForm({ name: tpl.name, subject: tpl.subject, body: tpl.body });
    setShowModal(true);
    setMsg(null);
  };

  const handleSave = async () => {
    if (!form.name || !form.subject || !form.body) {
      setMsg({ type: "error", text: "All fields required" }); return;
    }
    const result = await window.electronAPI.saveTemplate({ ...form, id: editing?.id });
    if (result.success) {
      setMsg({ type: "success", text: editing ? "Template updated!" : "Template saved!" });
      loadTemplates();
      setShowModal(false);
    }
    setTimeout(() => setMsg(null), 3000);
  };

  const handleDelete = async (id) => {
    if (window.confirm("Delete this template?")) {
      await window.electronAPI.deleteTemplate(id);
      loadTemplates();
    }
  };

  const SAMPLE_CONTACT = { name: "John Smith", company: "Acme Corp", city: "New York", country: "US", website: "acme.com", email: "john@acme.com" };
  const previewTemplate = (tpl) => {
    let body = tpl.body;
    Object.entries(SAMPLE_CONTACT).forEach(([k, v]) => {
      body = body.replace(new RegExp(`\\{\\{${k}\\}\\}`, "gi"), v);
    });
    setPreview({ ...tpl, previewBody: body });
  };

  // টেমপ্লেট ডেট ফিক্স করার জন্য হেল্পার ফাংশন
  const formatDate = (dateString) => {
    if (!dateString) return "Pending";
    const str = dateString.includes('Z') || dateString.includes('+') ? dateString : dateString + 'Z';
    return new Date(str).toLocaleDateString('en-GB', {
      day: '2-digit', month: '2-digit', year: 'numeric'
    });
  };

  return (
    <div className="page fade-in">
      <div className="page-header flex justify-between items-center">
        <div>
          <h1 className="page-title">Templates</h1>
          <p className="page-subtitle">Reusable email templates with personalization</p>
        </div>
        <button className="btn btn-primary" onClick={openCreate}>+ New Template</button>
      </div>

      {msg && !showModal && <div className={`alert alert-${msg.type}`}>{msg.text}</div>}

      <div className="alert alert-info" style={{ marginBottom: 16 }}>
        <strong>Personalization Variables:</strong> &#123;&#123;name&#125;&#125; &#123;&#123;email&#125;&#125; &#123;&#123;company&#125;&#125; &#123;&#123;city&#125;&#125; &#123;&#123;country&#125;&#125; &#123;&#123;website&#125;&#125;
      </div>

      {templates.length === 0 ? (
        <div className="card">
          <div className="empty-state">
            <div className="empty-state-icon">[T]</div>
            <div className="empty-state-title">No templates yet</div>
            <div className="empty-state-text">Create reusable email templates to save time</div>
          </div>
        </div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))", gap: 16 }}>
          {templates.map(tpl => (
            <div key={tpl.id} className="card">
              <div style={{ fontWeight: 700, fontSize: 15, color: "var(--text-primary)", marginBottom: 6 }}>{tpl.name}</div>
              <div style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 8 }}>Subject: {tpl.subject}</div>
              <div style={{ fontSize: 12, color: "var(--text-secondary)", marginBottom: 16, maxHeight: 60, overflow: "hidden", lineHeight: 1.5 }}>
                {tpl.body.replace(/<[^>]+>/g, "").substring(0, 120)}...
              </div>
              {/* আপডেট হওয়া সময় কল করা হলো */}
              <div style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 12 }}>
                📅 Updated: {tpl.updated_at ? formatDate(tpl.updated_at) : (tpl.created_at ? formatDate(tpl.created_at) : "Pending")}
              </div>
              <div className="flex gap-8">
                <button className="btn btn-secondary btn-sm" onClick={() => previewTemplate(tpl)}>Preview</button>
                <button className="btn btn-secondary btn-sm" onClick={() => openEdit(tpl)}>Edit</button>
                <button className="btn btn-danger btn-sm" onClick={() => handleDelete(tpl.id)}>Delete</button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Create/Edit Modal */}
      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal" style={{ maxWidth: 700 }} onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2 className="modal-title">{editing ? "Edit Template" : "New Template"}</h2>
              <button className="modal-close" onClick={() => setShowModal(false)}>X</button>
            </div>
            {msg && <div className={`alert alert-${msg.type}`}>{msg.text}</div>}
            <div className="form-group">
              <label className="form-label">Template Name</label>
              <input className="form-input" placeholder="e.g. Cold Outreach V1" value={form.name} onChange={e => setForm({...form, name: e.target.value})} />
            </div>
            <div className="form-group">
              <label className="form-label">Subject Line</label>
              <input className="form-input" placeholder="e.g. Quick question for {{company}}" value={form.subject} onChange={e => setForm({...form, subject: e.target.value})} />
            </div>
            <div className="form-group">
              <label className="form-label">Email Body (HTML supported)</label>
              <textarea className="form-textarea" style={{ minHeight: 200 }} placeholder="Hi {{name}},&#10;&#10;I came across {{company}} and wanted to reach out..." value={form.body} onChange={e => setForm({...form, body: e.target.value})} />
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary btn-sm" onClick={() => previewTemplate(form)}>Preview</button>
              <button className="btn btn-secondary" onClick={() => setShowModal(false)}>Cancel</button>
              <button className="btn btn-primary" onClick={handleSave}>Save Template</button>
            </div>
          </div>
        </div>
      )}

      {/* Preview Modal */}
      {preview && (
        <div className="modal-overlay" onClick={() => setPreview(null)}>
          <div className="modal" style={{ maxWidth: 700 }} onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2 className="modal-title">Preview: {preview.name}</h2>
              <button className="modal-close" onClick={() => setPreview(null)}>X</button>
            </div>
            <div style={{ background: "var(--bg-secondary)", padding: 16, borderRadius: 8, marginBottom: 12 }}>
              <strong style={{ fontSize: 12, color: "var(--text-muted)" }}>SUBJECT:</strong>
              <div style={{ marginTop: 4, color: "var(--text-primary)", fontWeight: 600 }}>{preview.subject || preview.previewBody?.subject}</div>
            </div>
            <div style={{ background: "white", padding: 20, borderRadius: 8, color: "#333", minHeight: 200 }}>
              <div dangerouslySetInnerHTML={{ __html: preview.previewBody || preview.body }} />
            </div>
            <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 8 }}>Preview uses sample data: John Smith, Acme Corp, New York, US</div>
            <div className="modal-footer">
              <button className="btn btn-primary" onClick={() => setPreview(null)}>Close</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}