import { format, parseISO } from "date-fns";
import Money from "./Money";

export default function SavingsGoals({ goals }) {
  return (
    <div className="chart-card">
      <div className="card-header"><span className="card-title">Savings Goals</span></div>
      {goals.length === 0 ? <p className="empty-note">No savings goals yet.</p> : (
        <div className="goal-list">
          {goals.map((g) => (
            <div className="goal-row" key={g.id}>
              <div className="goal-head">
                <span className="goal-name">{g.name}{g.status !== "ACTIVE" && <span className="badge success" style={{ marginLeft: 8 }}>{g.status === "COMPLETED" ? "Done" : "Cancelled"}</span>}</span>
                <span className="goal-amount"><Money value={g.currentAmount} /> of <Money value={g.targetAmount} /></span>
              </div>
              {g.targetDate && <p className="activity-time">Target date: {format(parseISO(g.targetDate), "d MMM yyyy")}</p>}
              <div className="progress-bar"><div className="progress-fill" style={{ width: `${Math.max(0, Math.min((g.currentAmount / g.targetAmount) * 100, 100))}%` }}></div></div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
