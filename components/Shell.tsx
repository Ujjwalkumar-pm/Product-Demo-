"use client";

import { useState } from "react";
import type { AdminData, CafeConfig } from "@/lib/actions";
import type { Centre } from "@/lib/seed-data";
import CafeView from "./cafe/CafeView";
import AdminView from "./admin/AdminView";

export default function Shell({
  centres,
  cafeCentreId,
  initialCafeConfig,
  initialAdminData,
  initialPwaUser,
}: {
  centres: Centre[];
  cafeCentreId: string;
  initialCafeConfig: CafeConfig;
  initialAdminData: AdminData;
  initialPwaUser: string | null;
}) {
  const [view, setView] = useState<"cafe" | "admin">("cafe");
  // Bumped whenever admin changes config/stores for the cafe's centre, so the
  // cafe tablet re-fetches and genuinely reflects admin changes.
  const [cafeReloadKey, setCafeReloadKey] = useState(0);

  const onCafeAffected = (centreId: string) => {
    if (centreId === cafeCentreId) setCafeReloadKey((k) => k + 1);
  };

  return (
    <>
      <div className="topbar">
        <h1>
          Smartworks · Cafe Feedback <em>v1</em>
        </h1>
        <div className="meta">Nexus Ops × Vendor Reports</div>
      </div>

      <div className="tabs">
        <div
          className={`tab ${view === "cafe" ? "active" : ""}`}
          onClick={() => setView("cafe")}
        >
          <span className="dot"></span>Cafe Tablet (PWA)
        </div>
        <div
          className={`tab ${view === "admin" ? "active" : ""}`}
          onClick={() => setView("admin")}
        >
          <span className="dot"></span>Admin · Vendor Reports Config
        </div>
      </div>

      <div className={`view ${view === "cafe" ? "active" : ""}`}>
        <CafeView
          key={cafeReloadKey}
          centreId={cafeCentreId}
          initialConfig={cafeReloadKey === 0 ? initialCafeConfig : undefined}
          initialUser={initialPwaUser}
        />
      </div>

      <div className={`view ${view === "admin" ? "active" : ""}`}>
        <AdminView
          centres={centres}
          initialData={initialAdminData}
          onCafeAffected={onCafeAffected}
        />
      </div>
    </>
  );
}
