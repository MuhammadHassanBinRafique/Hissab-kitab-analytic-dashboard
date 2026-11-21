import { format, parseISO } from "date-fns";
import useApi from "../hooks/useApi";
import * as api from "../services/api";
import Async from "../components/Async";
import Money from "../components/Money";
import SavingsGoals from "../components/SavingsGoals";
import PageHeader from "../components/PageHeader";

const ICON = { BANK: "fa-building-columns", CASH: "fa-money-bill", MOBILE_WALLET: "fa-mobile-screen", OTHER: "fa-wallet" };
const TYPE = { BANK: "Bank", CASH: "Cash", MOBILE_WALLET: "Mobile wallet", OTHER: "Other" };

// Portal screens covered: Accounts + Savings.
export default function AccountsSavingsPage({ refreshKey, onRefresh }) {
  const accounts = useApi(() => api.getAccounts(), [refreshKey]);
  const savings = useApi(() => api.getSavings(), [refreshKey]);

  const Row = ({ a }) => (
    <div className="dtr cols-rec">
      <span className="acct"><i className={`fas ${ICON[a.type] || "fa-wallet"}`}></i><span>{a.name}<small className="sub">{TYPE[a.type]}{a.isArchived ? " · archived" : ""}</small></span></span>
      <span className="r"><Money value={a.currentBalance} /></span>
    </div>
  );

  return (
    <>
      <PageHeader eyebrow="What do I have?" title="Accounts & Savings" hint="Where your money is kept, and the goals you are saving for." />
      <div className="bottom-row stack">
        <div className="flex1">
          <Async state={accounts} onRetry={onRefresh}>
            {({ accounts: list }) => {
              const active = list.filter((a) => !a.isArchived);
              const archived = list.filter((a) => a.isArchived);
              return (
                <section className="panel">
                  <div className="panel-head"><span className="card-title">Accounts</span><span className="muted">Total <Money value={active.reduce((s, a) => s + a.currentBalance, 0)} /></span></div>
                  <div className="dtable">{active.map((a) => <Row key={a.id} a={a} />)}</div>
                  {archived.length > 0 && <><p className="subhead">Archived (not counted in the total)</p><div className="dtable">{archived.map((a) => <Row key={a.id} a={a} />)}</div></>}
                </section>
              );
            }}
          </Async>
        </div>
        <div className="flex1">
          <Async state={savings} onRetry={onRefresh}>
            {(s) => (
              <>
                <SavingsGoals goals={s.goals} />
                <section className="panel" style={{ margin: "16px 0 0" }}>
                  <div className="panel-head"><span className="card-title">Recent savings activity</span></div>
                  {s.recentAllocations.length === 0 ? <p className="empty-note pad">No savings activity yet.</p> : (
                    <div className="dtable">
                      {s.recentAllocations.map((x) => (
                        <div className="dtr cols-rec" key={x.id}>
                          <span>{x.savingName}<small className="sub">{format(parseISO(x.date), "d MMM yyyy")} · {x.accountName}</small></span>
                          <span className="r">{x.amount < 0 ? "Took out " : "Saved "}<Money value={Math.abs(x.amount)} /></span>
                        </div>
                      ))}
                    </div>
                  )}
                </section>
              </>
            )}
          </Async>
        </div>
      </div>
    </>
  );
}
