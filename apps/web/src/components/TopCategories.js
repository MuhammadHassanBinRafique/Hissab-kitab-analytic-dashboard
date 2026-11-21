import { formatNumber, pctChange } from "../utils/format";
import { usePrivacy } from "./Money";

export default function TopCategories({ categories }) {
  const { hidden } = usePrivacy();
  const max = Math.max(...categories.map((c) => c.amount), 1);

  return (
    <div className="category-card">
      <div className="card-header">
        <span className="card-title">Where your money went</span>
      </div>
      <div className="category-divider"></div>

      {categories.length === 0 ? (
        <p className="empty-note">No expenses recorded this month.</p>
      ) : (
        <>
          <div className="category-col-labels">
            <span>Category</span>
            <span>Spent (Rs.)</span>
            <span>vs last month</span>
            <span></span>
          </div>
          <div className="category-rows">
            {categories.map((c) => {
              const change = pctChange(c.amount, c.previous);
              return (
                <div className="category-row" key={c.name}>
                  <span className="category-name">{c.name}</span>
                  <span className="category-amount">{hidden ? "••••" : formatNumber(c.amount)}</span>
                  {/* for spending, going up is the bad direction */}
                  <span className={`category-change ${change !== null && change > 0 ? "negative" : "positive"}`}>
                    {change === null ? "New" : `${change > 0 ? "+" : ""}${Math.round(change)}%`}
                  </span>
                  <div className="progress-bar">
                    <div className="progress-fill" style={{ width: `${(c.amount / max) * 100}%` }}></div>
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
