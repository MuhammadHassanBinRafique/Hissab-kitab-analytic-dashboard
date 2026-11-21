import { useState } from "react";
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import { formatNumber, formatRs } from "../utils/format";

const PALETTE = ["#6d49e9", "#16a34a", "#ea580c", "#dc2626", "#be185d", "#0891b2"];

export default function DonutCard({ title, data }) {
  const [hovered, setHovered] = useState(null);
  const total = data.reduce((sum, d) => sum + d.value, 0);

  return (
    <div className="chart-card">
      <div className="card-header">
        <span className="card-title">{title}</span>
      </div>

      {total <= 0 ? (
        <p className="empty-note">Nothing to show yet.</p>
      ) : (
        <div className="donut-wrapper">
          <div className="donut-chart-area">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={data}
                  dataKey="value"
                  innerRadius="68%"
                  outerRadius="100%"
                  stroke="none"
                  onMouseEnter={(_, i) => setHovered(i)}
                  onMouseLeave={() => setHovered(null)}
                >
                  {data.map((d, i) => (
                    <Cell key={d.name} fill={PALETTE[i % PALETTE.length]} />
                  ))}
                </Pie>
                <Tooltip formatter={(v) => formatRs(v)} />
              </PieChart>
            </ResponsiveContainer>
            <div className="chart-center-label">
              <span className="title">{hovered === null ? "Total" : data[hovered].name}</span>
              <span className="total">{formatNumber(hovered === null ? total : data[hovered].value)}</span>
            </div>
          </div>

          <div className="breakdown-list">
            {data.map((d, i) => (
              <div className="breakdown-item" key={d.name} onMouseEnter={() => setHovered(i)} onMouseLeave={() => setHovered(null)}>
                <span className="dot" style={{ background: PALETTE[i % PALETTE.length] }}></span>
                <span className="item-label">{d.name}</span>
                <span className="item-value">{Math.round((d.value / total) * 100)}%</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
