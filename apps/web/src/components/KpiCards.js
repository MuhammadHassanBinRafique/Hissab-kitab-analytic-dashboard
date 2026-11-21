import { pctChange } from "../utils/format";
import Money from "./Money";

const CARDS = [
  { key: "balance", title: "Total Balance", icon: "fa-wallet", hint: "Money you have right now", footer: "Across all active accounts" },
  { key: "income", title: "Income", icon: "fa-arrow-trend-up", hint: "Money that came in" },
  { key: "expenses", title: "Expenses", icon: "fa-arrow-trend-down", hint: "Money you spent", lowerIsBetter: true },
  { key: "saved", title: "Saved", icon: "fa-piggy-bank", hint: "Money you set aside" },
  { key: "left", title: "Left This Month", icon: "fa-scale-balanced", hint: "Income − spent − saved" },
];

function Badge({ change, lowerIsBetter }) {
  if (change === null) return <span className="kpi-badge neutral">New</span>;
  if (change === 0) return <span className="kpi-badge neutral">0%</span>;
  const rising = change > 0;
  const good = lowerIsBetter ? !rising : rising;
  return (
    <span className={`kpi-badge ${good ? "up" : "down"}`}>
      <i className={`fas fa-arrow-${rising ? "up" : "down"}`} style={{ fontSize: 9 }}></i>
      {rising ? "+" : ""}
      {change.toFixed(1)}%
    </span>
  );
}

export default function KpiCards({ kpis, previous }) {
  return (
    <div className="kpi-row">
      {CARDS.map(({ key, title, icon, hint, footer, lowerIsBetter }) => (
        <div className="kpi-card" key={key}>
          <div className="kpi-header">
            <span className="kpi-title">{title}</span>
            <div className="kpi-icon-wrap">
              <i className={`fas ${icon}`}></i>
            </div>
          </div>
          <div className="kpi-value"><Money value={kpis[key]} /></div>
          <p className="kpi-hint">{hint}</p>
          <div className="kpi-footer">
            {footer ? (
              <span className="kpi-label">{footer}</span>
            ) : (
              <>
                <span className="kpi-label">last month <Money value={previous[key]} /></span>
                <Badge change={pctChange(kpis[key], previous[key])} lowerIsBetter={lowerIsBetter} />
              </>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
