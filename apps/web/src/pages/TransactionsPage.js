import { useState } from "react";
import { format, parseISO } from "date-fns";
import useApi from "../hooks/useApi";
import * as api from "../services/api";
import Async from "../components/Async";
import Money from "../components/Money";
import PageHeader, { MonthPicker } from "../components/PageHeader";

const PAGE = 100;
const TYPES = [["", "All"], ["INCOME", "Income"], ["EXPENSE", "Expenses"], ["TRANSFER", "Transfers"], ["SAVING", "Savings"]];
const LABEL = { INCOME: "Income", EXPENSE: "Expense", TRANSFER: "Transfer", SAVING: "Savings" };

function Amount({ t }) {
  if (t.type === "SAVING") return <span className="amt saving">{t.amount < 0 ? "Took out " : "Saved "}<Money value={Math.abs(t.amount)} /></span>;
  return <span className={`amt ${t.type.toLowerCase()}`}>{t.type === "INCOME" ? "+" : t.type === "EXPENSE" ? "−" : ""}<Money value={t.amount} /></span>;
}

function exportCsv(rows) {
  const esc = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const lines = [["Date", "Type", "Category", "Account", "Description", "Amount"].join(",")].concat(
    rows.map((t) => [t.date.slice(0, 10), LABEL[t.type], t.categoryName, t.accountName, t.description, t.amount].map(esc).join(","))
  );
  const url = URL.createObjectURL(new Blob([lines.join("\n")], { type: "text/csv" }));
  Object.assign(document.createElement("a"), { href: url, download: "transactions.csv" }).click();
  URL.revokeObjectURL(url);
}

// Portal screens covered: Transactions + Reports (Monthly Ledger, Account Statement) + Settings > Recurring.
export default function TransactionsPage({ month, onMonth, refreshKey, onRefresh }) {
  const [type, setType] = useState("");
  const [accountId, setAccountId] = useState("");
  const [offset, setOffset] = useState(0);
  const accounts = useApi(() => api.getAccounts(), [refreshKey]);
  const ledger = useApi(() => api.getLedger({ month, type, accountId, limit: PAGE, offset }), [month, type, accountId, offset, refreshKey]);
  const recurring = useApi(() => api.getRecurring(), [refreshKey]);
  const account = accounts.data?.accounts.find((a) => a.id === accountId);
  const filtered = type !== "" || accountId !== "";
  const set = (fn) => (v) => { fn(v); setOffset(0); }; // any filter change goes back to page 1

  return (
    <>
      <PageHeader eyebrow="Where did my money go?" title="Transactions" hint="Every entry for the month, with the totals for what you are looking at.">
        <MonthPicker month={month} onChange={set(onMonth)} />
      </PageHeader>

      <div className="filters">
        <div className="seg" role="tablist">
          {TYPES.map(([k, l]) => <button key={k} className={type === k ? "on" : ""} onClick={() => set(setType)(k)}>{l}</button>)}
        </div>
        <select className="field" value={accountId} onChange={(e) => set(setAccountId)(e.target.value)} aria-label="Account">
          <option value="">All accounts</option>
          {accounts.data?.accounts.map((a) => <option key={a.id} value={a.id}>{a.name}{a.isArchived ? " (archived)" : ""}</option>)}
        </select>
        {filtered && <button className="link-btn" onClick={() => { setType(""); setAccountId(""); setOffset(0); }}>Clear filters</button>}
      </div>

      <Async state={ledger} onRetry={onRefresh}>
        {(l) => (
          <>
            <div className="mini-row">
              <div className="kpi-card"><span className="kpi-title">Money in</span><div className="kpi-value income"><Money value={l.summary.income} /></div></div>
              <div className="kpi-card"><span className="kpi-title">Money out</span><div className="kpi-value expense"><Money value={l.summary.expenses} /></div></div>
              <div className="kpi-card"><span className="kpi-title">Difference</span><div className="kpi-value"><Money value={l.summary.income - l.summary.expenses} /></div></div>
            </div>
            <section className="panel">
              <div className="panel-head">
                <span className="card-title">{format(parseISO(`${month}-01`), "MMMM yyyy")} · {l.total} entries</span>
                <button className="tb-btn" onClick={() => exportCsv(l.rows)} disabled={!l.rows.length}><i className="fas fa-download"></i> Export CSV</button>
              </div>
              {account && <div className="dtr note"><span>Opening balance of {account.name}</span><Money value={account.openingBalance} /></div>}
              {l.rows.length === 0 ? <p className="empty-note pad">No transactions match these filters.</p> : (
                <div className="dtable">
                  <div className="dtr dth cols-tx"><span>Date</span><span>Description</span><span className="hide-sm">Category</span><span className="hide-sm">Account</span><span className="r">Amount</span></div>
                  {l.rows.map((t) => (
                    <div className="dtr cols-tx" key={t.id}>
                      <span className="muted">{format(parseISO(t.date), "d MMM")}</span>
                      <span>{t.description || t.categoryName || LABEL[t.type]}<small className="sub">{t.type === "TRANSFER" ? `${t.fromAccountName} → ${t.toAccountName}` : `${t.categoryName ?? LABEL[t.type]} · ${t.accountName}`}</small></span>
                      <span className="hide-sm">{t.type === "TRANSFER" ? "Transfer" : t.categoryName}</span>
                      <span className="hide-sm">{t.type === "TRANSFER" ? `${t.fromAccountName} → ${t.toAccountName}` : t.accountName}</span>
                      <span className="r"><Amount t={t} /></span>
                    </div>
                  ))}
                </div>
              )}
              {l.total > PAGE && (
                <div className="panel-head">
                  <span className="muted">Showing {offset + 1}–{Math.min(offset + PAGE, l.total)} of {l.total}</span>
                  <span>
                    <button className="link-btn" disabled={offset === 0} onClick={() => setOffset(Math.max(0, offset - PAGE))}>Previous</button>{" · "}
                    <button className="link-btn" disabled={offset + PAGE >= l.total} onClick={() => setOffset(offset + PAGE)}>Next</button>
                  </span>
                </div>
              )}
            </section>
          </>
        )}
      </Async>

      <section className="panel">
        <div className="panel-head"><span className="card-title">Repeating transactions</span></div>
        {!recurring.data ? <p className="empty-note pad">{recurring.error ? "Could not load repeating transactions." : "Loading…"}</p> : recurring.data.recurring.length === 0 ? <p className="empty-note pad">Nothing set to repeat.</p> : (
          <div className="dtable">
            {recurring.data.recurring.map((r) => (
              <div className="dtr cols-rec" key={r.id}>
                <span>{r.description || r.categoryName}<small className="sub">{LABEL[r.type]} · {r.frequency.toLowerCase()} · next {format(parseISO(r.nextRunDate), "d MMM yyyy")}{r.isActive ? "" : " · paused"}{r.accountName ? ` · ${r.accountName}` : ""}</small></span>
                <span className="r"><Amount t={r} /></span>
              </div>
            ))}
          </div>
        )}
      </section>
    </>
  );
}
