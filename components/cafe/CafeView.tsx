"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  getCafeConfig,
  submitFeedback,
  type CafeConfig,
} from "@/lib/actions";
import { logoutPwa } from "@/lib/auth";
import { DEVICE_ID, ratingWords } from "@/lib/seed-data";
import CafeLogin from "./CafeLogin";

type ScreenId = "welcome" | "vendor" | "rate" | "tags" | "comment" | "ty";
const screens: ScreenId[] = ["welcome", "vendor", "rate", "tags", "comment", "ty"];
const screenLabels: Record<ScreenId, string> = {
  welcome: "Welcome",
  vendor: "Vendor select",
  rate: "Ratings",
  tags: "Quick tags",
  comment: "Comment + contact",
  ty: "Thank you",
};

const STAR_PATH =
  "M12 2l2.9 6.4 7.1.7-5.3 4.8 1.5 7-6.2-3.7-6.2 3.7 1.5-7L1.9 9.1l7.1-.7z";

function StarSvg({ size }: { size: number }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size}>
      <path d={STAR_PATH} />
    </svg>
  );
}

type AppState = {
  vendorId: string | null;
  overall: number;
  categories: Record<string, number>;
  positiveTags: string[];
  negativeTags: string[];
  comment: string;
  name: string;
  mobile: string;
};

const emptyState = (): AppState => ({
  vendorId: null,
  overall: 0,
  categories: {},
  positiveTags: [],
  negativeTags: [],
  comment: "",
  name: "",
  mobile: "",
});

const MOBILE_RE = /^\d{10}$/;

function formatJSON(obj: unknown) {
  let str = JSON.stringify(obj, null, 2);
  str = str.replace(/"([^"]+)":/g, '<span class="k">"$1"</span>:');
  str = str.replace(/: "([^"]*)"/g, ': <span class="s">"$1"</span>');
  str = str.replace(/: (true|false|null|\d+)/g, ': <span class="s">$1</span>');
  return str;
}

export default function CafeView({
  centreId,
  initialConfig,
  initialUser,
}: {
  centreId: string;
  initialConfig?: CafeConfig;
  initialUser?: string | null;
}) {
  const [config, setConfig] = useState<CafeConfig | null>(initialConfig ?? null);
  const [user, setUser] = useState<string | null>(initialUser ?? null);
  const [currentScreen, setCurrentScreen] = useState<ScreenId>("welcome");
  const [state, setState] = useState<AppState>(() => {
    const s = emptyState();
    if (initialUser) s.name = initialUser;
    return s;
  });
  const [ref, setRef] = useState("FB-2026-00X");
  const [count, setCount] = useState(8);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const onLoggedIn = (username: string) => {
    setUser(username);
    setState((s) => ({ ...emptyState(), name: username }));
    setCurrentScreen("welcome");
    setError(null);
  };

  const onSwitchUser = async () => {
    await logoutPwa();
    setUser(null);
    setState(emptyState());
    setCurrentScreen("welcome");
    setError(null);
  };

  useEffect(() => {
    if (!initialConfig) {
      getCafeConfig(centreId).then(setConfig);
    }
  }, [centreId, initialConfig]);

  const resetFlow = useCallback(() => {
    setState(() => {
      const s = emptyState();
      if (user) s.name = user;
      return s;
    });
    setCurrentScreen("welcome");
    setError(null);
  }, [user]);

  const goTo = (screen: ScreenId) => {
    setError(null);
    setCurrentScreen(screen);
  };

  useEffect(() => {
    if (currentScreen !== "ty") return;
    setCount(8);
    countdownRef.current = setInterval(() => {
      setCount((n) => {
        if (n <= 1) {
          if (countdownRef.current) clearInterval(countdownRef.current);
          resetFlow();
          return 0;
        }
        return n - 1;
      });
    }, 1000);
    return () => {
      if (countdownRef.current) clearInterval(countdownRef.current);
    };
  }, [currentScreen, resetFlow]);

  if (!config) {
    return (
      <div className="cafe-stage">
        <div className="tablet-area">
          <div className="tablet" style={{ alignItems: "center", justifyContent: "center" }}>
            <div style={{ color: "var(--ink-3)", fontSize: 13, margin: "auto" }}>
              Loading tablet…
            </div>
          </div>
        </div>
        <div className="state-panel" />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="cafe-stage">
        <div className="tablet-area">
          <div className="tablet">
            <div className="tablet-status">
              <span>9:41</span>
              <span className="right">5G · 100%</span>
            </div>
            <div className="pwa-content">
              <CafeLogin
                centreShort={config.centreShort}
                onLogin={onLoggedIn}
              />
            </div>
          </div>
        </div>
        <div className="state-panel">
          <div className="sp-header">
            <div className="sp-title">Wireframe Inspector</div>
            <div className="live-dot">
              <span className="d"></span>Login required
            </div>
          </div>
          <div className="schema-label">Status</div>
          <div className="sp-data">
            <div className="sp-row">
              <span className="k">Tablet</span>
              <span className="v empty">Awaiting sign-in</span>
            </div>
            <div className="sp-row">
              <span className="k">Centre</span>
              <span className="v">{config.centreName}</span>
            </div>
          </div>
          <p
            style={{
              fontSize: 11,
              color: "var(--ink-3)",
              marginTop: 14,
              lineHeight: 1.5,
            }}
          >
            The feedback flow unlocks once an authorised Smartworks login signs
            in on the tablet. Manage logins under Admin → Cafe PWA login
            credentials.
          </p>
        </div>
      </div>
    );
  }

  const vendorName = state.vendorId
    ? config.vendors.find((v) => v.id === state.vendorId)?.name ?? null
    : null;
  const contextPill = vendorName ?? config.centreShort;

  const trimmedName = state.name.trim();
  const trimmedMobile = state.mobile.trim();
  const mobileFormatBad = trimmedMobile !== "" && !MOBILE_RE.test(trimmedMobile);

  const submit = async () => {
    if (mobileFormatBad) {
      setError("Mobile number must be exactly 10 digits.");
      return;
    }
    setSubmitting(true);
    const res = await submitFeedback({
      centreId,
      vendorId: state.vendorId ?? "",
      overall: state.overall,
      categoryRatings: state.categories,
      positiveTags: state.positiveTags,
      negativeTags: state.negativeTags,
      comment: state.comment,
      contact: "",
      name: trimmedName,
      mobile: trimmedMobile,
    });
    setSubmitting(false);
    if (res.ok) {
      setRef(res.ref);
      goTo("ty");
    } else {
      setError(res.error);
    }
  };

  const goNext = () => {
    if (currentScreen === "welcome") goTo("vendor");
    else if (currentScreen === "vendor") {
      if (state.vendorId) goTo("rate");
    } else if (currentScreen === "rate") {
      if (state.overall > 0) goTo("tags");
    } else if (currentScreen === "tags") goTo("comment");
    else if (currentScreen === "comment") submit();
  };

  const goBack = () => {
    const i = screens.indexOf(currentScreen);
    if (i > 0) goTo(screens[i - 1]);
  };

  const idx = screens.indexOf(currentScreen);
  const footerHidden = currentScreen === "welcome" || currentScreen === "ty";
  const commentBlocked = currentScreen === "comment" && mobileFormatBad;
  const nextDisabled =
    (currentScreen === "vendor" && !state.vendorId) ||
    (currentScreen === "rate" && state.overall === 0) ||
    commentBlocked ||
    submitting;

  const toggleTag = (type: "pos" | "neg", tag: string) => {
    setState((s) => {
      const key = type === "pos" ? "positiveTags" : "negativeTags";
      const arr = s[key];
      const next = arr.includes(tag)
        ? arr.filter((t) => t !== tag)
        : [...arr, tag];
      return { ...s, [key]: next };
    });
  };

  const payload = {
    centre_id: centreId,
    vendor_id: state.vendorId,
    overall_rating: state.overall,
    category_ratings: state.categories,
    positive_tags: state.positiveTags,
    negative_tags: state.negativeTags,
    comment: state.comment || null,
    name: trimmedName || null,
    mobile: trimmedMobile || null,
    device_id: DEVICE_ID,
    submitted_at: new Date().toISOString().slice(0, 19) + "Z",
    auto_ticket: state.overall > 0 && state.overall <= 2,
  };

  const catsSummary = Object.entries(state.categories)
    .map(([k, v]) => {
      const c = config.categories.find((x) => x.id === k);
      return c ? `${c.name}: ${v}★` : null;
    })
    .filter(Boolean)
    .join(", ");

  return (
    <div className="cafe-stage">
      <div className="tablet-area">
        <div className="tablet">
          <div className="tablet-status">
            <span>9:41</span>
            <span className="right">5G · 100%</span>
          </div>
          <div className="pwa-content">
            {/* WELCOME */}
            <div className={`screen ${currentScreen === "welcome" ? "active" : ""}`}>
              <div className="brand-strip">
                <div className="brand-mark">
                  Smartworks · <span>cafe</span>
                </div>
                <div className="centre-pill">{config.centreShort}</div>
              </div>
              <div className="welcome-illus">— a quick moment for taste —</div>
              <h1 className="welcome-display">
                How was
                <br />
                <em>your meal?</em>
              </h1>
              <p className="welcome-sub">
                Your feedback goes straight to the vendor and our ops team. Takes
                under 30 seconds.
              </p>
              <button className="big-cta" onClick={() => goTo("vendor")}>
                <span>Start feedback</span>
                <span className="arrow">→</span>
              </button>
              <div className="timer-tag">
                Signed in as <b>{user}</b> ·{" "}
                <button
                  type="button"
                  className="switch-user"
                  onClick={onSwitchUser}
                >
                  Switch user
                </button>
              </div>
            </div>

            {/* VENDOR */}
            <div className={`screen ${currentScreen === "vendor" ? "active" : ""}`}>
              <div className="brand-strip">
                <div className="brand-mark">
                  Smartworks · <span>cafe</span>
                </div>
                <div className="centre-pill">{config.centreShort}</div>
              </div>
              <div className="step-marker">STEP 1 OF 4</div>
              <h2 className="step-title">
                Which <em>vendor</em>?
              </h2>
              <div className="vendor-grid">
                {config.vendors.length === 0 && (
                  <div className="mini-empty">
                    No vendors available right now
                  </div>
                )}
                {config.vendors.map((v) => (
                  <div
                    key={v.id}
                    className={`vendor-card ${state.vendorId === v.id ? "selected" : ""}`}
                    onClick={() =>
                      setState((s) => ({ ...s, vendorId: v.id }))
                    }
                  >
                    <div className="vendor-logo">{v.initial}</div>
                    <div className="vendor-info">
                      <div className="vendor-name">{v.name}</div>
                      <div className="vendor-sub">{v.cat}</div>
                    </div>
                    <div className="vendor-check">
                      {state.vendorId === v.id ? "✓" : ""}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* RATE */}
            <div className={`screen ${currentScreen === "rate" ? "active" : ""}`}>
              <div className="brand-strip">
                <div className="brand-mark">
                  Smartworks · <span>cafe</span>
                </div>
                <div className="centre-pill">{contextPill}</div>
              </div>
              <div className="step-marker">STEP 2 OF 4</div>
              <h2 className="step-title">
                Overall <em>rating</em>
              </h2>
              <div className="stars-block">
                {[1, 2, 3, 4, 5].map((i) => (
                  <div
                    key={i}
                    className={`star ${i <= state.overall ? "active" : ""}`}
                    onClick={() => setState((s) => ({ ...s, overall: i }))}
                  >
                    <StarSvg size={44} />
                  </div>
                ))}
              </div>
              <div className="rating-label">
                {ratingWords[state.overall] || "tap a star"}
              </div>
              <div style={{ marginTop: 18 }}>
                <div className="step-marker" style={{ marginBottom: 12 }}>
                  RATE THE SPECIFICS
                </div>
                <div>
                  {config.categories.map((cat) => {
                    const val = state.categories[cat.id] || 0;
                    return (
                      <div className="cat-row" key={cat.id}>
                        <div className="cat-name">{cat.name}</div>
                        <div className="cat-stars">
                          {[1, 2, 3, 4, 5].map((i) => (
                            <svg
                              key={i}
                              className={`cat-star ${i <= val ? "active" : ""}`}
                              viewBox="0 0 24 24"
                              onClick={() =>
                                setState((s) => ({
                                  ...s,
                                  categories: { ...s.categories, [cat.id]: i },
                                }))
                              }
                            >
                              <path d={STAR_PATH} />
                            </svg>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* TAGS */}
            <div className={`screen ${currentScreen === "tags" ? "active" : ""}`}>
              <div className="brand-strip">
                <div className="brand-mark">
                  Smartworks · <span>cafe</span>
                </div>
                <div className="centre-pill">{contextPill}</div>
              </div>
              <div className="step-marker">STEP 3 OF 4</div>
              <h2 className="step-title">
                What <em>stood out</em>?
              </h2>
              <div className="tag-section">
                <div className="tag-section-title">+ Liked</div>
                <div className="tag-cloud">
                  {config.positiveTags.map((t) => (
                    <div
                      key={t}
                      className={`chip ${state.positiveTags.includes(t) ? "selected positive" : ""}`}
                      onClick={() => toggleTag("pos", t)}
                    >
                      {t}
                    </div>
                  ))}
                </div>
              </div>
              <div className="tag-section">
                <div className="tag-section-title">— Could be better</div>
                <div className="tag-cloud">
                  {config.negativeTags.map((t) => (
                    <div
                      key={t}
                      className={`chip ${state.negativeTags.includes(t) ? "selected negative" : ""}`}
                      onClick={() => toggleTag("neg", t)}
                    >
                      {t}
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* COMMENT */}
            <div className={`screen ${currentScreen === "comment" ? "active" : ""}`}>
              <div className="brand-strip">
                <div className="brand-mark">
                  Smartworks · <span>cafe</span>
                </div>
                <div className="centre-pill">{contextPill}</div>
              </div>
              <div className="step-marker">STEP 4 OF 4</div>
              <h2 className="step-title">
                Anything <em>else</em>?
              </h2>
              {config.showComment && (
                <textarea
                  className="text-input"
                  rows={5}
                  placeholder="Optional — tell us more about your experience"
                  value={state.comment}
                  onChange={(e) =>
                    setState((s) => ({ ...s, comment: e.target.value }))
                  }
                />
              )}
              {config.askContact && (
                <>
                  <div className="contact-row">
                    <span style={{ fontSize: 18 }}>✱</span>
                    <input
                      type="text"
                      placeholder="Name (optional)"
                      value={state.name}
                      autoComplete="name"
                      onChange={(e) =>
                        setState((s) => ({ ...s, name: e.target.value }))
                      }
                    />
                  </div>
                  <div className="contact-row" style={{ marginTop: 8 }}>
                    <span style={{ fontSize: 18 }}>☎</span>
                    <input
                      type="tel"
                      inputMode="numeric"
                      pattern="\d{10}"
                      maxLength={10}
                      placeholder="10-digit mobile (optional)"
                      value={state.mobile}
                      autoComplete="tel-national"
                      onChange={(e) => {
                        const digits = e.target.value.replace(/\D/g, "").slice(0, 10);
                        setState((s) => ({ ...s, mobile: digits }));
                      }}
                    />
                  </div>
                </>
              )}
              <p
                style={{
                  fontSize: 10,
                  color: "var(--ink-3)",
                  marginTop: 8,
                  lineHeight: 1.5,
                }}
              >
                Leave blank to stay anonymous. We&apos;ll only reach out if you
                share contact and there&apos;s a service issue.
              </p>
              {mobileFormatBad && (
                <p
                  style={{
                    fontSize: 11,
                    color: "var(--red)",
                    marginTop: 6,
                  }}
                >
                  Mobile number must be exactly 10 digits.
                </p>
              )}
              {error && (
                <p
                  style={{
                    fontSize: 12,
                    color: "var(--red)",
                    marginTop: 10,
                  }}
                >
                  {error}
                </p>
              )}
            </div>

            {/* THANK YOU */}
            <div className={`screen ${currentScreen === "ty" ? "active" : ""}`}>
              <div className="ty-wrap">
                <div className="ty-mark">✓</div>
                <h2 className="ty-title">
                  Thank <em>you</em>
                </h2>
                <p className="ty-sub">
                  Your feedback was sent to <b>{vendorName ?? "the vendor"}</b>.
                  They&apos;ll get a daily digest tomorrow morning.
                </p>
                <div className="ty-meta">
                  Reference · <strong>{ref}</strong>
                </div>
                <div className="ty-counter">
                  Resetting in <span>{count}</span>s…
                </div>
              </div>
            </div>
          </div>

          {!footerHidden && (
            <div className="pwa-footer">
              <div className="progress-dots">
                {[0, 1, 2, 3].map((i) => (
                  <div
                    key={i}
                    className={`pd ${i < idx - 1 ? "done" : ""} ${i === idx - 1 ? "current" : ""}`}
                  />
                ))}
              </div>
              <button className="btn-secondary" onClick={goBack}>
                Back
              </button>
              <button
                className="btn-primary"
                onClick={goNext}
                disabled={nextDisabled}
              >
                {currentScreen === "comment"
                  ? submitting
                    ? "Sending…"
                    : "Submit"
                  : "Next"}
              </button>
            </div>
          )}
        </div>
      </div>

      {/* INSPECTOR */}
      <div className="state-panel">
        <div className="sp-header">
          <div className="sp-title">Wireframe Inspector</div>
          <div className="live-dot">
            <span className="d"></span>Live
          </div>
        </div>

        <div className="schema-label">Jump to screen</div>
        <div className="nav-buttons">
          {screens.map((s, i) => (
            <button
              key={s}
              className={currentScreen === s ? "current" : ""}
              onClick={() => goTo(s)}
            >
              <span>{screenLabels[s]}</span>
              <span className="num">{String(i + 1).padStart(2, "0")}</span>
            </button>
          ))}
        </div>

        <div className="schema-label">Captured so far</div>
        <div className="sp-data">
          <div className="sp-row">
            <span className="k">Centre</span>
            <span className="v">{config.centreName}</span>
          </div>
          <div className="sp-row">
            <span className="k">Vendor</span>
            <span className={`v ${vendorName ? "" : "empty"}`}>
              {vendorName ?? "not selected"}
            </span>
          </div>
          <div className="sp-row">
            <span className="k">Overall</span>
            <span className={`v ${state.overall ? "" : "empty"}`}>
              {state.overall
                ? `${state.overall}★ · ${ratingWords[state.overall]}`
                : "not rated"}
            </span>
          </div>
          <div className="sp-row">
            <span className="k">Categories</span>
            <span className={`v ${catsSummary ? "" : "empty"}`}>
              {catsSummary || "none"}
            </span>
          </div>
          <div className="sp-row">
            <span className="k">+ Tags</span>
            <span className={`v ${state.positiveTags.length ? "" : "empty"}`}>
              {state.positiveTags.join(", ") || "none"}
            </span>
          </div>
          <div className="sp-row">
            <span className="k">− Tags</span>
            <span className={`v ${state.negativeTags.length ? "" : "empty"}`}>
              {state.negativeTags.join(", ") || "none"}
            </span>
          </div>
          <div className="sp-row">
            <span className="k">Comment</span>
            <span className={`v ${state.comment ? "" : "empty"}`}>
              {state.comment || "none"}
            </span>
          </div>
          <div className="sp-row">
            <span className="k">Name</span>
            <span className={`v ${trimmedName ? "" : "empty"}`}>
              {trimmedName || "anonymous"}
            </span>
          </div>
          <div className="sp-row">
            <span className="k">Mobile</span>
            <span className={`v ${trimmedMobile ? "" : "empty"}`}>
              {trimmedMobile || "anonymous"}
            </span>
          </div>
        </div>

        <div className="schema-label">Payload preview</div>
        <pre
          className="schema-block"
          dangerouslySetInnerHTML={{ __html: formatJSON(payload) }}
        />
      </div>
    </div>
  );
}
