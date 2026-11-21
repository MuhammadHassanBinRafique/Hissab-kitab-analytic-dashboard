import { useRef, useState } from "react";
import { format, parseISO } from "date-fns";
import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import useClickOutside from "../hooks/useClickOutside";
import { formatRs } from "../utils/format";

const SERIES = [
  { key: "income", name: "Income", color: "#16a34a" },
  { key: "expenses", name: "Expenses", color: "#ea580c" },
  { key: "saved", name: "Saved", color: "#6d49e9" },
];

export default function TrendChart({ trend }) {
  const [selected, setSelected] = useState("all");
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useClickOutside(ref, () => setOpen(false));

  const data = trend.map((t) => ({ ...t, label: format(parseISO(`${t.month}-01`), "MMM") }));
  const visible = selected === "all" ? SERIES : SERIES.filter((s) => s.key === selected);
  const options = [{ key: "all", name: "All" }, ...SERIES];

  return (
    <div className="trend-card">
      <div className="card-header">
        <span className="card-title">Income vs Expenses</span>
        <div className="card-actions">
          <div className="filter-container" ref={ref}>
            <button className="action-btn" onClick={() => setOpen(!open)}>
              <i className="fas fa-filter"></i> {options.find((o) => o.key === selected).name}
            </button>
            {open && (
              <div className="filter-dropdown">
                {options.map((o) => (
                  <div
                    key={o.key}
                    className={o.key === selected ? "active" : ""}
                    onClick={() => {
                      setSelected(o.key);
                      setOpen(false);
                    }}
                  >
                    {o.name}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="chart-container">
        <ResponsiveContainer width="100%" height={300}>
          <LineChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e8eaf0" vertical={false} />
            <XAxis dataKey="label" tick={{ fontSize: 12, fill: "#9ca3af" }} axisLine={false} tickLine={false} />
            <YAxis
              tick={{ fontSize: 12, fill: "#9ca3af" }}
              axisLine={false}
              tickLine={false}
              width={44}
              tickFormatter={(v) => (v >= 1000 ? `${v / 1000}k` : v)}
            />
            <Tooltip formatter={(v) => formatRs(v)} />
            <Legend />
            {visible.map((s) => (
              <Line
                key={s.key}
                type="monotone"
                dataKey={s.key}
                name={s.name}
                stroke={s.color}
                strokeWidth={2.5}
                dot={trend.length < 3}
                activeDot={{ r: 5 }}
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
