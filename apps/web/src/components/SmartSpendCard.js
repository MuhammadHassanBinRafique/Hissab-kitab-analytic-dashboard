import { format, parseISO } from "date-fns";
import AmountText from "./AmountText";
import Money from "./Money";

export default function SmartSpendCard({ smartspend: s }) {
  return (
    <div className="chart-card">
      <div className="card-header"><span className="card-title">SmartSpend advice</span></div>
      <ul className="summary-list">{s.advice.map((a, i) => <li key={i}><AmountText parts={a} /></li>)}</ul>
      {s.goals.length > 0 && (
        <>
          <p className="subhead">To reach your goals</p>
          <ul className="summary-list">
            {s.goals.map((g) => (
              <li key={g.id}>
                {g.name}: save <Money value={g.monthly} /> a month
                {g.deadline ? ` to get there by ${format(parseISO(g.deadline), "MMM yyyy")}` : ""}
                {g.stretch ? " (a stretch at your current spending)" : ""}
              </li>
            ))}
          </ul>
        </>
      )}
      {s.emergencyFund && <p className="empty-note">No goals yet. A good first one is an emergency fund of <Money value={s.emergencyFund} /> (about 3 months of spending).</p>}
    </div>
  );
}
