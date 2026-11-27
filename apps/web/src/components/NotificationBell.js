import { useEffect, useRef, useState } from "react";
import { format, formatDistanceToNow, parseISO } from "date-fns";
import { Bell } from "lucide-react";
import useApi from "../hooks/useApi";
import useClickOutside from "../hooks/useClickOutside";
import { useAuth } from "../auth/AuthContext";
import * as api from "../services/api";
import AmountText from "./AmountText";

const ICON = {
  income: "fa-arrow-trend-up", expense: "fa-arrow-trend-down", transfer: "fa-right-left", account: "fa-wallet",
  "goal-deposit": "fa-piggy-bank", "goal-withdraw": "fa-piggy-bank", "goal-reached": "fa-trophy", password: "fa-key",
};

// "What has this person already seen" lives ONLY in this browser (localStorage), per user. The dashboard is read-only
// and never writes to the database, so another browser or phone keeps its own red dot.
const storageKey = (userId) => `hk_notif_seen:${userId}`;
const readSeen = (key) => { try { return window.localStorage.getItem(key); } catch { return null; } };
const writeSeen = (key, value) => { try { window.localStorage.setItem(key, value); } catch { /* private mode: the dot simply comes back next time */ } };

export default function NotificationBell({ refreshKey, onViewAll }) {
  const { user } = useAuth();
  const key = storageKey(user.id);
  const [open, setOpen] = useState(false);
  const [opens, setOpens] = useState(0); // opening the card fetches again, so it is always fresh
  const [seen, setSeen] = useState(() => readSeen(key)); // time of the newest thing seen here (server clock)
  const [newSince, setNewSince] = useState(null); // what counted as new when the card was opened, to highlight those
  const state = useApi(() => api.getNotifications(), [refreshKey, opens]);
  const { data } = state;
  const ref = useRef(null);
  const buttonRef = useRef(null);
  // A click elsewhere closes the card, except on controls marked data-keep-open (like "Show amounts", which should work with it open).
  useClickOutside(ref, (e) => { if (!e.target.closest?.("[data-keep-open]")) setOpen(false); });

  // First visit in this browser: the existing history is not "new". While the card is open, everything shown counts as seen.
  useEffect(() => {
    if (data && (seen === null || open)) { writeSeen(key, data.serverTime); setSeen(data.serverTime); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, open]);

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => { if (e.key === "Escape") { setOpen(false); buttonRef.current?.focus(); } };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  const unread = Boolean(data && seen && data.notifications.some((n) => n.at > seen)); // same clock and format: plain string compare is safe
  const isNew = (n) => newSince !== null && n.at > newSince;

  const toggle = () => {
    if (!open) { setNewSince(seen); setOpens((o) => o + 1); }
    setOpen(!open);
  };

  return (
    <div className="notif-wrap" ref={ref}>
      <button ref={buttonRef} className="tb-btn notif-btn" onClick={toggle} aria-haspopup="dialog" aria-expanded={open}
        aria-label={unread ? "Notifications, new ones available" : "Notifications"}>
        <Bell size={16} aria-hidden="true" />
        {unread && <span className="notif-dot" data-testid="notif-dot"></span>}
      </button>

      {open && (
        <div className="notif-card" role="dialog" aria-label="Notifications">
          <div className="notif-head"><span className="card-title">Notifications</span><span className="muted">Last 30 days</span></div>
          {state.error && !data ? (
            <div className="notif-empty">
              We couldn’t load your notifications.{" "}
              <button className="link-btn" onClick={() => setOpens((o) => o + 1)}>Try again</button>
            </div>
          ) : !data ? (
            <div className="notif-empty">Loading…</div>
          ) : data.notifications.length === 0 ? (
            <div className="notif-empty">Nothing new yet. When money moves or your account changes, it will show up here.</div>
          ) : (
            <ul className="notif-list">
              {data.notifications.map((n) => (
                <li key={n.id} className={`notif-item ${isNew(n) ? "new" : ""}`}>
                  <span className={`notif-icon ${n.kind}`}><i className={`fas ${ICON[n.kind] || "fa-bell"}`} aria-hidden="true"></i></span>
                  <div>
                    <p className="notif-msg"><AmountText parts={n.parts} /></p>
                    <p className="activity-time" title={format(parseISO(n.at), "d MMM yyyy, h:mm a")}>
                      {formatDistanceToNow(parseISO(n.at), { addSuffix: true })}
                      {isNew(n) && <span className="notif-new">New</span>}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          )}
          <button className="notif-foot" onClick={() => { setOpen(false); onViewAll(); }}>View all activity</button>
        </div>
      )}
    </div>
  );
}
