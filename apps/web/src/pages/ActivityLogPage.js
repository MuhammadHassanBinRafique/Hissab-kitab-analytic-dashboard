import { useEffect, useState } from "react";
import { format, parseISO } from "date-fns";
import * as api from "../services/api";
import { useAuth } from "../auth/AuthContext";
import PageHeader from "../components/PageHeader";

// Plain-English names for the portal's audit events (the code is still shown underneath).
const EVENTS = {
  "transaction.create": "Transaction added", "transaction.update": "Transaction changed", "transaction.delete": "Transaction deleted", "transfer.create": "Transfer made",
  "account.create": "Account created", "account.update": "Account changed", "account.archive": "Account archived", "account.unarchive": "Account restored", "account.delete": "Account deleted",
  "category.create": "Category added", "category.update": "Category changed", "category.delete": "Category deleted",
  "saving.create": "Savings goal created", "saving.update": "Savings goal changed", "saving.delete": "Savings goal deleted", "saving.deposit": "Money put into a goal", "saving.withdraw": "Money taken from a goal",
  "recurring.create": "Repeating item created", "recurring.update": "Repeating item changed", "recurring.delete": "Repeating item deleted", "recurring.process": "Repeating item ran", "recurring.skip": "Repeating item skipped",
  "auth.sign_in": "Signed in", "auth.sign_out": "Signed out", "auth.password_change": "Password changed",
};
const name = (e) => EVENTS[e] || e;

// Portal screen covered: Audit Log (also read-only here).
export default function ActivityLogPage({ refreshKey, onRefresh }) {
  const { signOut } = useAuth();
  const [status, setStatus] = useState("");
  const [event, setEvent] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [rows, setRows] = useState([]);
  const [next, setNext] = useState(null);
  const [ui, setUi] = useState({ loading: true, error: null });
  const [open, setOpen] = useState(null);

  const load = async (cursor, isCancelled = () => false) => {
    setUi({ loading: true, error: null });
    try {
      const page = await api.getActivity({ status, event, from, to, cursor });
      if (isCancelled()) return;
      setRows((r) => (cursor ? [...r, ...page.rows] : page.rows));
      setNext(page.nextCursor);
      setUi({ loading: false, error: null });
    } catch (err) {
      if (isCancelled()) return;
      if (err.status === 401) return signOut();
      setUi({ loading: false, error: err.message });
    }
  };
  useEffect(() => {
    let off = false;
    load(undefined, () => off);
    return () => { off = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, event, from, to, refreshKey]);

  return (
    <>
      <PageHeader eyebrow="Your activity · last 90 days" title="Activity Log" hint="A record of what happened in your account and when. Failed means the action did not go through." />
      <div className="filters">
        <div className="seg">
          {[["", "All"], ["success", "Success"], ["failed", "Failed"]].map(([k, l]) => <button key={k} className={status === k ? "on" : ""} onClick={() => setStatus(k)}>{l}</button>)}
        </div>
        <select className="field" value={event} onChange={(e) => setEvent(e.target.value)} aria-label="Event">
          <option value="">All events</option>
          {Object.keys(EVENTS).map((e) => <option key={e} value={e}>{name(e)}</option>)}
        </select>
        <input className="field" type="date" value={from} max={to || undefined} onChange={(e) => setFrom(e.target.value)} aria-label="From date" />
        <input className="field" type="date" value={to} min={from || undefined} onChange={(e) => setTo(e.target.value)} aria-label="To date" />
      </div>

      {ui.error && <div className="state-banner" role="alert"><span>{ui.error}</span><button onClick={onRefresh}>Retry</button></div>}
      <section className="panel">
        {rows.length === 0 ? <p className="empty-note pad">{ui.loading ? "Loading…" : ui.error ? "Could not load your activity." : "No activity matches these filters."}</p> : (
          <div className="dtable">
            <div className="dtr dth cols-log"><span>When</span><span>What happened</span><span>Result</span><span className="hide-sm r">Details</span></div>
            {rows.map((a) => (
              <div key={a.id}>
                <div className="dtr cols-log">
                  <span className="muted">{format(parseISO(a.createdAt), "d MMM, h:mm a")}</span>
                  <span>{name(a.event)}<small className="sub mono">{a.event} · {a.statusCode}</small></span>
                  <span className={`badge ${a.success ? "success" : "failed"}`}>{a.success ? "Success" : "Failed"}</span>
                  <span className="r"><button className="link-btn" onClick={() => setOpen(open === a.id ? null : a.id)}>{open === a.id ? "Hide" : "View"}</button></span>
                </div>
                {open === a.id && <pre className="resp">{`${a.method} ${a.path}\n${JSON.stringify(a.response, null, 2)}`}</pre>}
              </div>
            ))}
          </div>
        )}
        {next && <div className="panel-head"><span className="muted">{rows.length} shown</span><button className="link-btn" disabled={ui.loading} onClick={() => load(next)}>{ui.loading ? "Loading…" : "Load more"}</button></div>}
      </section>
    </>
  );
}
