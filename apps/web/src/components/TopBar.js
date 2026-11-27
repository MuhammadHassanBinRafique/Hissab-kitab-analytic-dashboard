import { useRef, useState } from "react";
import { useAuth } from "../auth/AuthContext";
import useClickOutside from "../hooks/useClickOutside";
import { usePrivacy } from "./Money";
import NotificationBell from "./NotificationBell";

export default function TopBar({ onMenuToggle, onRefresh, refreshKey, onViewActivity }) {
  const { user, signOut } = useAuth();
  const { hidden, toggle } = usePrivacy();
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useClickOutside(ref, () => setOpen(false));
  const name = user.name || user.email;

  return (
    <header className="topbar">
      <button className="mobile-menu-btn" onClick={onMenuToggle} aria-label="Open menu"><i className="fas fa-bars"></i></button>
      <span className="read-only-pill"><i className="fas fa-lock"></i> View only</span>
      <div className="topbar-right">
        <button className="tb-btn" onClick={toggle} aria-pressed={hidden} data-keep-open>
          <i className={`fas fa-eye${hidden ? "" : "-slash"}`}></i> <span className="hide-sm">{hidden ? "Show amounts" : "Hide amounts"}</span>
        </button>
        <button className="tb-btn" onClick={onRefresh} aria-label="Refresh">
          <i className="fas fa-rotate"></i> <span className="hide-sm">Refresh</span>
        </button>
        <NotificationBell refreshKey={refreshKey} onViewAll={onViewActivity} />
        <div className="profile-container" ref={ref}>
          <div className="profile-box" onClick={() => setOpen(!open)}>
            <div className="avatar">{name.charAt(0).toUpperCase()}</div>
            <div className="profile-info"><p className="profile-name">{name}</p></div>
            <i className={`fas fa-chevron-${open ? "up" : "down"}`}></i>
          </div>
          {open && (
            <div className="profile-dropdown">
              <p>{user.email}</p>
              <button className="logout-btn" onClick={signOut}><i className="fas fa-sign-out-alt" style={{ marginRight: 6 }}></i>Sign out</button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
