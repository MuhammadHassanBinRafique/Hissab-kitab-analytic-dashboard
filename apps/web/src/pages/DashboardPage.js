import { useState } from "react";
import Sidebar from "../components/Sidebar";
import TopBar from "../components/TopBar";
import OverviewPage from "./OverviewPage";
import TransactionsPage from "./TransactionsPage";
import AccountsSavingsPage from "./AccountsSavingsPage";
import ActivityLogPage from "./ActivityLogPage";

const PAGES = [
  { id: "overview", label: "Overview", icon: "fa-table-cells-large", Page: OverviewPage },
  { id: "transactions", label: "Transactions", icon: "fa-right-left", Page: TransactionsPage },
  { id: "accounts", label: "Accounts & Savings", icon: "fa-wallet", Page: AccountsSavingsPage },
  { id: "activity", label: "Activity Log", icon: "fa-clipboard-list", Page: ActivityLogPage },
];

export default function DashboardPage() {
  const [page, setPage] = useState("overview");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [month, setMonth] = useState(() => new Date().toISOString().slice(0, 7));
  const [refreshKey, setRefreshKey] = useState(0); // the Refresh button re-fetches the current page; nothing refreshes by itself
  const { Page } = PAGES.find((p) => p.id === page);

  return (
    <div className="app">
      <Sidebar pages={PAGES} current={page} onNavigate={(id) => { setPage(id); setSidebarOpen(false); }} isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />
      <main className="main">
        <TopBar onMenuToggle={() => setSidebarOpen((o) => !o)} onRefresh={() => setRefreshKey((k) => k + 1)} refreshKey={refreshKey} onViewActivity={() => setPage("activity")} />
        <Page month={month} onMonth={setMonth} refreshKey={refreshKey} onRefresh={() => setRefreshKey((k) => k + 1)} />
      </main>
    </div>
  );
}
