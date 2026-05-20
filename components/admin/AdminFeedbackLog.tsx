"use client";

import { useEffect, useMemo, useState } from "react";
import { getAllFeedback, type FeedbackLogRow } from "@/lib/actions";
import type { Centre } from "@/lib/seed-data";

type Filter = {
  centreId: string;
  minRating: number;
};

function csvEscape(value: unknown): string {
  if (value === null || value === undefined) return "";
  const s = typeof value === "string" ? value : JSON.stringify(value);
  if (/[",\n\r]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

function rowsToCsv(rows: FeedbackLogRow[]): string {
  const headers = [
    "Reference",
    "Submitted at",
    "Centre",
    "Vendor",
    "Overall",
    "Auto ticket",
    "Name",
    "Mobile",
    "Comment",
    "Positive tags",
    "Negative tags",
    "Category ratings",
    "Legacy contact",
  ];
  const lines = [headers.join(",")];
  for (const r of rows) {
    lines.push(
      [
        csvEscape(r.ref),
        csvEscape(new Date(r.createdAt).toLocaleString()),
        csvEscape(r.centreName),
        csvEscape(r.vendorName),
        csvEscape(r.overall),
        csvEscape(r.autoTicket ? "yes" : "no"),
        csvEscape(r.name ?? ""),
        csvEscape(r.mobile ?? ""),
        csvEscape(r.comment ?? ""),
        csvEscape((r.positiveTags ?? []).join("; ")),
        csvEscape((r.negativeTags ?? []).join("; ")),
        csvEscape(
          Object.entries(r.categoryRatings ?? {})
            .map(([k, v]) => `${k}:${v}`)
            .join("; "),
        ),
        csvEscape(r.contact ?? ""),
      ].join(","),
    );
  }
  return lines.join("\r\n");
}

function triggerDownload(filename: string, contents: string, mime: string) {
  const blob = new Blob([contents], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export default function AdminFeedbackLog({
  centres,
}: {
  centres: Centre[];
}) {
  const [rows, setRows] = useState<FeedbackLogRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>({ centreId: "", minRating: 0 });
  const [exporting, setExporting] = useState(false);

  const load = async (next: Filter) => {
    setLoading(true);
    setError(null);
    try {
      const data = await getAllFeedback({
        centreId: next.centreId || undefined,
        minRating: next.minRating || undefined,
      });
      setRows(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load feedback.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load(filter);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onCentreChange = (centreId: string) => {
    const next = { ...filter, centreId };
    setFilter(next);
    load(next);
  };
  const onMinRatingChange = (minRating: number) => {
    const next = { ...filter, minRating };
    setFilter(next);
    load(next);
  };

  const summary = useMemo(() => {
    if (rows.length === 0) return { total: 0, avg: 0, low: 0 };
    const total = rows.length;
    const avg = rows.reduce((a, r) => a + r.overall, 0) / total;
    const low = rows.filter((r) => r.overall <= 2).length;
    return { total, avg, low };
  }, [rows]);

  const onExport = () => {
    setExporting(true);
    try {
      const csv = rowsToCsv(rows);
      const stamp = new Date().toISOString().slice(0, 10);
      const centrePart = filter.centreId ? `-${filter.centreId}` : "";
      triggerDownload(
        `cafe-feedback${centrePart}-${stamp}.csv`,
        // BOM so Excel renders UTF-8 correctly
        "﻿" + csv,
        "text/csv;charset=utf-8",
      );
    } finally {
      setExporting(false);
    }
  };

  return (
    <section className="admin-card">
      <div className="admin-card-head">
        <h3 className="admin-card-title">Feedback log</h3>
        <p className="admin-card-sub">
          Every submission collected from the cafe tablets. Filter, review, and
          export to Excel (.csv) for further analysis.
        </p>
      </div>

      <div className="fb-toolbar">
        <label className="fb-filter">
          Centre
          <select
            value={filter.centreId}
            onChange={(e) => onCentreChange(e.target.value)}
          >
            <option value="">All centres</option>
            {centres.map((c) => (
              <option key={c.id} value={c.id}>
                {c.short}
              </option>
            ))}
          </select>
        </label>
        <label className="fb-filter">
          Min overall
          <select
            value={filter.minRating}
            onChange={(e) => onMinRatingChange(Number(e.target.value))}
          >
            <option value={0}>Any</option>
            <option value={1}>1★ +</option>
            <option value={2}>2★ +</option>
            <option value={3}>3★ +</option>
            <option value={4}>4★ +</option>
            <option value={5}>5★ only</option>
          </select>
        </label>
        <button
          type="button"
          className="fb-export"
          onClick={onExport}
          disabled={exporting || rows.length === 0}
        >
          {exporting ? "Exporting…" : `Export to Excel (${rows.length})`}
        </button>
      </div>

      <div className="fb-summary">
        <div className="fb-stat">
          <span className="k">Total</span>
          <span className="v">{summary.total}</span>
        </div>
        <div className="fb-stat">
          <span className="k">Average</span>
          <span className="v">{summary.avg ? summary.avg.toFixed(2) : "—"}</span>
        </div>
        <div className="fb-stat">
          <span className="k">Low (≤ 2★)</span>
          <span className="v">{summary.low}</span>
        </div>
      </div>

      {error && <p className="cred-error">{error}</p>}

      <div className="fb-table-wrap">
        {loading ? (
          <div className="cred-empty">Loading feedback…</div>
        ) : rows.length === 0 ? (
          <div className="cred-empty">No feedback matches these filters.</div>
        ) : (
          <table className="fb-table">
            <thead>
              <tr>
                <th>When</th>
                <th>Centre</th>
                <th>Vendor</th>
                <th>★</th>
                <th>Name</th>
                <th>Mobile</th>
                <th>Comment</th>
                <th>Ref</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className={r.overall <= 2 ? "low" : ""}>
                  <td>{new Date(r.createdAt).toLocaleString()}</td>
                  <td>{r.centreName}</td>
                  <td>{r.vendorName}</td>
                  <td className="fb-stars">{r.overall}★</td>
                  <td>{r.name || "—"}</td>
                  <td>{r.mobile || "—"}</td>
                  <td className="fb-comment">{r.comment || "—"}</td>
                  <td className="fb-ref">{r.ref}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </section>
  );
}
