"use client";

import { useState } from "react";
import {
  getAdminData,
  saveCentreConfig,
  toggleStoreLive,
  type AdminData,
} from "@/lib/actions";
import { allCategories, type Centre } from "@/lib/seed-data";

export default function AdminView({
  centres,
  initialData,
  onCafeAffected,
}: {
  centres: Centre[];
  initialData: AdminData;
  onCafeAffected: (centreId: string) => void;
}) {
  const [data, setData] = useState<AdminData>(initialData);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [posDraft, setPosDraft] = useState("");
  const [negDraft, setNegDraft] = useState("");

  const centre = centres.find((c) => c.id === data.centreId);
  const liveCount = data.stores.filter((s) => s.live).length;
  const totalCount = data.stores.length;
  const sumLiveFb7d = data.stores
    .filter((s) => s.live)
    .reduce((a, s) => a + s.fb7d, 0);
  const estPerDay = Math.max(0, Math.round(sumLiveFb7d / 7));
  const previewCentreShort = centre?.short ?? data.centreId;
  const previewCentreName = previewCentreShort.split(" ·")[0];

  const dirty = () => {
    setSaved(false);
  };

  const onCentreChange = async (id: string) => {
    const next = await getAdminData(id);
    setData(next);
    setSaved(false);
  };

  const onToggleStore = async (storeId: string) => {
    const next = await toggleStoreLive(storeId);
    setData(next);
    onCafeAffected(next.centreId);
  };

  const toggleCat = (id: string) => {
    setData((d) => ({
      ...d,
      activeCategories: d.activeCategories.includes(id)
        ? d.activeCategories.filter((c) => c !== id)
        : [...d.activeCategories, id],
    }));
    dirty();
  };

  const removeTag = (type: "pos" | "neg", i: number) => {
    setData((d) => {
      const key = type === "pos" ? "positiveTags" : "negativeTags";
      const arr = [...d[key]];
      arr.splice(i, 1);
      return { ...d, [key]: arr };
    });
    dirty();
  };

  const addTag = (type: "pos" | "neg") => {
    const v = (type === "pos" ? posDraft : negDraft).trim();
    if (!v) return;
    setData((d) => {
      const key = type === "pos" ? "positiveTags" : "negativeTags";
      return { ...d, [key]: [...d[key], v] };
    });
    if (type === "pos") setPosDraft("");
    else setNegDraft("");
    dirty();
  };

  const toggleFlag = (
    key: "showComment" | "askContact" | "mandatoryContactLow",
  ) => {
    setData((d) => ({ ...d, [key]: !d[key] }));
    dirty();
  };

  const toggleRouting = (key: keyof AdminData["routing"]) => {
    setData((d) => ({
      ...d,
      routing: { ...d.routing, [key]: !d.routing[key] },
    }));
    dirty();
  };

  const save = async () => {
    setSaving(true);
    await saveCentreConfig({
      centreId: data.centreId,
      activeCategories: data.activeCategories,
      positiveTags: data.positiveTags,
      negativeTags: data.negativeTags,
      showComment: data.showComment,
      askContact: data.askContact,
      mandatoryContactLow: data.mandatoryContactLow,
      routing: data.routing,
    });
    setSaving(false);
    setSaved(true);
    onCafeAffected(data.centreId);
  };

  return (
    <div className="admin-stage">
      <div className="admin-main">
        <div>
          <div className="breadcrumb">
            Vendor Reports / <b>Cafe Feedback Configuration</b>
          </div>
          <h1 className="page-h">
            Cafe Feedback <em>Configuration</em>
          </h1>
          <div className="page-sub">
            Pick a centre, mark the stores that are live for tablet feedback, and
            shape the questions employees see.
          </div>
        </div>

        {/* 1. Centre selector */}
        <div className="card">
          <div className="card-header">
            <div className="card-h">
              <span className="num">1</span>Choose centre
            </div>
            <div style={{ fontSize: 11, color: "var(--ink-3)" }}>
              Configuration is per-centre
            </div>
          </div>
          <div className="field-row">
            <div className="field">
              <label>Centre</label>
              <select
                value={data.centreId}
                onChange={(e) => onCentreChange(e.target.value)}
              >
                {centres.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label>Tablet device ID</label>
              <input type="text" defaultValue="TAB-CCG-CAFE-04" />
            </div>
            <div className="field">
              <label>Owner team</label>
              <select>
                <option>F&amp;B Ops · Anshu</option>
                <option>Centre Ops</option>
                <option>Founder&apos;s Office</option>
              </select>
            </div>
          </div>
        </div>

        {/* 2. Stores */}
        <div className="card">
          <div className="card-header">
            <div className="card-h">
              <span className="num">2</span>Stores at this centre
            </div>
            <div style={{ fontSize: 11, color: "var(--ink-3)" }}>
              <span>{liveCount}</span> of <span>{totalCount}</span> stores live
            </div>
          </div>
          <div className="store-list">
            <div className="store-head">
              <div></div>
              <div>Store / Vendor</div>
              <div>Category</div>
              <div>Last 7d</div>
              <div style={{ textAlign: "right" }}>Live</div>
            </div>
            <div>
              {data.stores.map((s) => (
                <div className="store-row" key={s.id}>
                  <div className="store-logo">{s.initial}</div>
                  <div>
                    <div className="store-name">{s.name}</div>
                    <div className="store-sub">store_id: {s.id}</div>
                  </div>
                  <div>
                    <span className="store-cat">{s.cat}</span>
                  </div>
                  <div className="feedback-count">
                    {s.live ? `${s.fb7d} feedbacks` : "—"}
                    <span className="lbl">
                      {s.live ? "this week" : "inactive"}
                    </span>
                  </div>
                  <div className={`toggle-cell ${s.live ? "live" : ""}`}>
                    <div
                      className={`toggle ${s.live ? "on" : ""}`}
                      onClick={() => onToggleStore(s.id)}
                    ></div>
                    <span className="live-label">{s.live ? "Live" : "Off"}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* 3. Question config */}
        <div className="card">
          <div className="card-header">
            <div className="card-h">
              <span className="num">3</span>What employees are asked
            </div>
            <div style={{ fontSize: 11, color: "var(--ink-3)" }}>
              Applies to all live stores at this centre
            </div>
          </div>

          <div className="editor-block">
            <div className="editor-h">Rating categories</div>
            <div className="editor-sub">
              Pick the per-category star ratings shown after the overall rating.
              We recommend 3–5.
            </div>
            <div className="checkbox-grid">
              {allCategories.map((c) => (
                <label
                  key={c.id}
                  className={`checkbox-item ${data.activeCategories.includes(c.id) ? "checked" : ""}`}
                  onClick={() => toggleCat(c.id)}
                >
                  <span className="cb-box">✓</span>
                  {c.name}
                </label>
              ))}
            </div>
          </div>

          <div className="editor-block">
            <div className="editor-h">Positive quick-tags</div>
            <div className="editor-sub">
              Shown when overall rating is 4★ or higher.
            </div>
            <div className="chips-editable">
              {data.positiveTags.map((t, i) => (
                <div className="e-chip pos" key={`${t}-${i}`}>
                  <span>{t}</span>
                  <span className="x" onClick={() => removeTag("pos", i)}>
                    ×
                  </span>
                </div>
              ))}
              <input
                className="add-chip-input"
                placeholder="+ add tag"
                value={posDraft}
                onChange={(e) => setPosDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") addTag("pos");
                }}
              />
            </div>
          </div>

          <div className="editor-block">
            <div className="editor-h">Negative quick-tags</div>
            <div className="editor-sub">
              Shown when overall rating is 3★ or lower. Drive Nexus Ticket
              categories.
            </div>
            <div className="chips-editable">
              {data.negativeTags.map((t, i) => (
                <div className="e-chip neg" key={`${t}-${i}`}>
                  <span>{t}</span>
                  <span className="x" onClick={() => removeTag("neg", i)}>
                    ×
                  </span>
                </div>
              ))}
              <input
                className="add-chip-input"
                placeholder="+ add tag"
                value={negDraft}
                onChange={(e) => setNegDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") addTag("neg");
                }}
              />
            </div>
          </div>

          <div className="editor-block" style={{ marginBottom: 0 }}>
            <div className="editor-h">Comment + contact</div>
            <div className="checkbox-grid">
              <label
                className={`checkbox-item ${data.showComment ? "checked" : ""}`}
                onClick={() => toggleFlag("showComment")}
              >
                <span className="cb-box">✓</span>Show free-text comment
              </label>
              <label
                className={`checkbox-item ${data.askContact ? "checked" : ""}`}
                onClick={() => toggleFlag("askContact")}
              >
                <span className="cb-box">✓</span>Ask for mobile/employee ID
                (optional)
              </label>
              <label
                className={`checkbox-item ${data.mandatoryContactLow ? "checked" : ""}`}
                onClick={() => toggleFlag("mandatoryContactLow")}
              >
                <span className="cb-box">✓</span>Make contact mandatory if ≤2★
              </label>
            </div>
          </div>
        </div>

        {/* 4. Routing */}
        <div className="card">
          <div className="card-header">
            <div className="card-h">
              <span className="num">4</span>What happens with the feedback
            </div>
          </div>
          <div className="editor-block" style={{ marginBottom: 0 }}>
            <div
              className="checkbox-grid"
              style={{ gridTemplateColumns: "1fr 1fr" }}
            >
              <label
                className={`checkbox-item ${data.routing.dailyDigest ? "checked" : ""}`}
                onClick={() => toggleRouting("dailyDigest")}
              >
                <span className="cb-box">✓</span>Daily digest email to vendor
              </label>
              <label
                className={`checkbox-item ${data.routing.autoTicketLow ? "checked" : ""}`}
                onClick={() => toggleRouting("autoTicketLow")}
              >
                <span className="cb-box">✓</span>Auto-open Nexus Ticket if ≤2★
              </label>
              <label
                className={`checkbox-item ${data.routing.rollupDashboard ? "checked" : ""}`}
                onClick={() => toggleRouting("rollupDashboard")}
              >
                <span className="cb-box">✓</span>Roll up to Vendor Reports
                dashboard
              </label>
              <label
                className={`checkbox-item ${data.routing.slackAlertLow ? "checked" : ""}`}
                onClick={() => toggleRouting("slackAlertLow")}
              >
                <span className="cb-box">✓</span>Slack alert to F&amp;B Ops on
                ≤2★
              </label>
            </div>
          </div>
        </div>

        {/* Open questions */}
        <div className="open-q">
          <div className="open-q-h">⚠ Open questions for review</div>
          <ul>
            <li>
              <b>Identity:</b> default to fully anonymous, or always capture
              device + timestamp? Right now mobile/employee ID is optional —
              confirm.
            </li>
            <li>
              <b>Spam guard:</b> how do we prevent a single employee from
              spamming a vendor 20× in one sitting? Cooldown by IP / vendor /
              device? Suggested: 1 submission per vendor per 15 min per device.
            </li>
            <li>
              <b>Ticket linkage:</b> does a 1–2★ feedback auto-open a Nexus
              Ticket, or just flag it? If auto-open, what&apos;s the reason field
              and end-time source?
            </li>
            <li>
              <b>Centre vs store override:</b> can a single store override the
              centre-level tag list, or must all stores use the same set? Current
              build assumes centre-level only.
            </li>
            <li>
              <b>QR vs Tablet:</b> is this only kiosk, or do we also expose via
              the cafe DQR (post-order)? Affects auth + anti-spam design.
            </li>
          </ul>
        </div>

        <div className="action-bar">
          <div className="summary">
            Changes affect <b>{centre?.name ?? data.centreId}</b> ·{" "}
            <b>
              {liveCount} store{liveCount === 1 ? "" : "s"} live
            </b>{" "}
            · saves to CRM
          </div>
          <div className="btns">
            <button className="btn-secondary">Preview as employee</button>
            <button
              className="btn-primary"
              onClick={save}
              disabled={saving}
            >
              {saving
                ? "Saving…"
                : saved
                  ? "Saved ✓"
                  : "Save & push to tablets"}
            </button>
          </div>
        </div>
      </div>

      {/* LIVE PREVIEW PANEL */}
      <div className="preview-panel">
        <div className="pp-header">
          <div className="pp-eyebrow">
            <span className="live-dot">● LIVE PREVIEW</span>
          </div>
          <div className="pp-title">
            What employees see at <em>{previewCentreName}</em>
          </div>
        </div>

        <div className="mini-tablet">
          <div className="mini-brand">
            Smartworks · <span>cafe</span>
          </div>
          <div className="mini-centre">{previewCentreShort}</div>
          <div className="mini-title">
            Which <em>vendor</em>?
          </div>
          <div className="mini-vendor-list">
            {data.stores.filter((s) => s.live).length === 0 ? (
              <div className="mini-empty">
                No vendors live — tablet will show &quot;no vendors available
                right now&quot;
              </div>
            ) : (
              data.stores
                .filter((s) => s.live)
                .map((s) => (
                  <div className="mini-vendor" key={s.id}>
                    <div className="mvl">{s.initial}</div>
                    <div className="name">{s.name}</div>
                    <div style={{ fontSize: 10, color: "var(--ink-3)" }}>
                      {s.cat}
                    </div>
                  </div>
                ))
            )}
          </div>
        </div>

        <div className="pp-impact">
          <div className="pp-impact-h">Downstream impact</div>
          <div className="pp-impact-row">
            <span className="k">Vendors visible on tablet</span>
            <span className="v">{liveCount}</span>
          </div>
          <div className="pp-impact-row">
            <span className="k">Rating categories asked</span>
            <span className="v">{data.activeCategories.length}</span>
          </div>
          <div className="pp-impact-row">
            <span className="k">Positive tags shown (≥4★)</span>
            <span className="v">{data.positiveTags.length}</span>
          </div>
          <div className="pp-impact-row">
            <span className="k">Negative tags shown (≤3★)</span>
            <span className="v">{data.negativeTags.length}</span>
          </div>
          <div className="pp-impact-row">
            <span className="k">Auto-tickets on ≤2★</span>
            <span className={`v ${data.routing.autoTicketLow ? "up" : "down"}`}>
              {data.routing.autoTicketLow ? "ON" : "OFF"}
            </span>
          </div>
          <div className="pp-impact-row">
            <span className="k">Est. submissions/day</span>
            <span className="v">~{estPerDay}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
