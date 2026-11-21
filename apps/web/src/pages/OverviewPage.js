import useApi from "../hooks/useApi";
import * as api from "../services/api";
import Async from "../components/Async";
import KpiCards from "../components/KpiCards";
import TrendChart from "../components/TrendChart";
import TopCategories from "../components/TopCategories";
import DonutCard from "../components/DonutCard";
import SmartSpendCard from "../components/SmartSpendCard";
import PageHeader, { MonthPicker } from "../components/PageHeader";

// Portal screens covered: Dashboard + SmartSpend + Reports (Category Breakdown, Trends).
export default function OverviewPage({ month, onMonth, refreshKey, onRefresh }) {
  const state = useApi(() => api.getOverview(month), [month, refreshKey]);
  return (
    <>
      <PageHeader eyebrow="How am I doing?" title="Overview" hint="A quick picture of your money for the month you pick.">
        <MonthPicker month={month} onChange={onMonth} />
      </PageHeader>
      <Async state={state} onRetry={onRefresh}>
        {(o) => (
          <>
            <KpiCards kpis={o.kpis} previous={o.previous} />
            <div className="charts-row">
              <TrendChart trend={o.trend} />
              <TopCategories categories={o.categories} />
            </div>
            <div className="bottom-row">
              <DonutCard title="Where your income came from" data={o.incomeSources.map((s) => ({ name: s.name, value: s.amount }))} />
              <SmartSpendCard smartspend={o.smartspend} />
            </div>
          </>
        )}
      </Async>
    </>
  );
}
