import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import App from "./App";
import overview from "./test-fixtures/overview.json";
import ledger from "./test-fixtures/ledger.json";
import accounts from "./test-fixtures/accounts.json";
import savings from "./test-fixtures/savings.json";
import recurring from "./test-fixtures/recurring.json";
import activity from "./test-fixtures/activity.json";
import notifications from "./test-fixtures/notifications.json";

// These fixtures are REAL responses captured from the API (demo mode), so a contract change breaks these tests.
let signedIn;
const json = (status, body) => Promise.resolve(new Response(body === null ? null : JSON.stringify(body), { status }));
beforeEach(() => {
  signedIn = false;
  window.localStorage.clear();
  global.fetch = jest.fn((url, opts = {}) => {
    const path = String(url).split("?")[0];
    if (path === "/api/auth/me") return signedIn ? json(200, { user: { id: "u", email: "demo@hisabkitab.pk" } }) : json(401, { error: "Session expired" });
    if (path === "/api/auth/login") {
      const ok = JSON.parse(opts.body).password === "demo1234";
      signedIn = ok;
      return ok ? json(200, { user: { id: "u", email: "demo@hisabkitab.pk" } }) : json(401, { error: "Invalid email or password" });
    }
    if (path === "/api/auth/logout") { signedIn = false; return json(204, null); }
    const data = { "/api/overview": overview, "/api/transactions": ledger, "/api/accounts": accounts, "/api/savings": savings, "/api/recurring": recurring, "/api/activity-log": activity, "/api/notifications": notifications }[path];
    return data ? json(200, data) : json(404, { error: "not found" });
  });
});

async function signIn(password = "demo1234") {
  await userEvent.type(await screen.findByLabelText(/email/i), "demo@hisabkitab.pk");
  await userEvent.type(screen.getByLabelText("Password"), password);
  await userEvent.click(screen.getByRole("button", { name: /sign in/i }));
}

test("signed out: only the login page is shown", async () => {
  render(<App />);
  expect(await screen.findByRole("button", { name: /sign in/i })).toBeInTheDocument();
  expect(screen.queryByText("Total Balance")).not.toBeInTheDocument();
});

test("wrong password shows the server's error and stays on the login page", async () => {
  render(<App />);
  await signIn("nope");
  expect(await screen.findByRole("alert")).toHaveTextContent(/invalid email or password/i);
});

test("after login the overview shows real API data; amounts are hidden until the user shows them", async () => {
  render(<App />);
  await signIn();
  expect(await screen.findByText("Total Balance")).toBeInTheDocument();
  expect(screen.getByText("View only")).toBeInTheDocument();
  expect(screen.queryByText(/Rs\. \d/)).not.toBeInTheDocument(); // hidden by default, like the portal
  await userEvent.click(screen.getByRole("button", { name: /show amounts/i }));
  expect(screen.getAllByText(new RegExp(`Rs\\. ${overview.kpis.income.toLocaleString("en-US")}`)).length).toBeGreaterThan(0);
  expect(screen.getByText("SmartSpend advice")).toBeInTheDocument();
});

test("every page loads its data and there is no way to change anything", async () => {
  render(<App />);
  await signIn();
  await screen.findByText("Total Balance");

  await userEvent.click(screen.getByText("Transactions"));
  expect(await screen.findByText("Repeating transactions")).toBeInTheDocument();
  expect(await screen.findByText(new RegExp(`${ledger.total} entries`))).toBeInTheDocument();

  await userEvent.click(screen.getByText("Accounts & Savings"));
  expect(await screen.findByText("Archived (not counted in the total)")).toBeInTheDocument();
  expect(await screen.findByText("Recent savings activity")).toBeInTheDocument();

  await userEvent.click(screen.getByText("Activity Log"));
  expect(await screen.findByText("What happened")).toBeInTheDocument();
  expect(within(document.body).getAllByText(/Signed in|Transaction added/).length).toBeGreaterThan(0);

  // read-only: no add/edit/delete controls anywhere
  expect(screen.queryByRole("button", { name: /^(add|edit|delete|save)\b/i })).not.toBeInTheDocument();
  const writes = global.fetch.mock.calls.filter(([, o]) => o && o.method && o.method !== "GET" && !String(o.method).match(/POST/));
  expect(writes).toEqual([]);
});

test("the login page links to Hisab-Kitab and opens it in a new tab, safely", async () => {
  render(<App />);
  const link = await screen.findByRole("link", { name: /open hisab-kitab/i });
  expect(link).toHaveAttribute("href", "https://hisab-kitab-mn.vercel.app/login");
  expect(link).toHaveAttribute("target", "_blank");
  expect(link).toHaveAttribute("rel", expect.stringContaining("noopener"));
});

test("a server failure shows a friendly message with a short reference, not technical details", async () => {
  const ok = global.fetch;
  global.fetch = jest.fn((url, opts) => String(url).startsWith("/api/overview")
    ? Promise.resolve(new Response(JSON.stringify({ error: "We couldn't load your data right now. Please try again in a moment.", code: "DATABASE_UNAVAILABLE", requestId: "abcd1234-ffff" }), { status: 503 }))
    : ok(url, opts));
  render(<App />);
  await signIn();
  const alert = await screen.findByRole("alert");
  expect(alert).toHaveTextContent("We couldn't load your data right now. Please try again in a moment. (Reference: abcd1234)");
});

const SEEN_KEY = "hk_notif_seen:u"; // the mock user's id is "u"
const bell = () => screen.getByRole("button", { name: /^notifications/i });

describe("notifications", () => {
  test("first visit in a browser: the history is not 'new', so no red dot; the card still lists it", async () => {
    render(<App />);
    await signIn();
    await screen.findByText("Total Balance");
    await screen.findByRole("button", { name: "Notifications" }); // loaded, and not "new ones available"
    expect(screen.queryByTestId("notif-dot")).not.toBeInTheDocument();
    await userEvent.click(bell());
    const card = await screen.findByRole("dialog", { name: "Notifications" });
    expect(within(card).getByText(/your password was changed/i)).toBeInTheDocument();
    expect(within(card).queryByText("New")).not.toBeInTheDocument();
    expect(window.localStorage.getItem(SEEN_KEY)).toBe(notifications.serverTime); // remembered in THIS browser only
  });

  test("unseen notifications show a red dot; opening the card marks them new, clears the dot, and it stays cleared", async () => {
    window.localStorage.setItem(SEEN_KEY, "2000-01-01T00:00:00.000Z");
    const first = render(<App />);
    await signIn();
    expect(await screen.findByTestId("notif-dot")).toBeInTheDocument();
    expect(bell()).toHaveAccessibleName("Notifications, new ones available");

    await userEvent.click(bell());
    const card = await screen.findByRole("dialog", { name: "Notifications" });
    expect(within(card).getAllByText("New")).toHaveLength(notifications.notifications.length);
    expect(within(card).getByText(/goal reached/i)).toBeInTheDocument();
    expect(within(card).queryByText(/signed in/i)).not.toBeInTheDocument(); // sign-in never appears
    expect(screen.queryByTestId("notif-dot")).not.toBeInTheDocument();

    first.unmount(); // "reload": same browser memory
    render(<App />);
    await screen.findByText("Total Balance");
    await screen.findByRole("button", { name: "Notifications" });
    expect(screen.queryByTestId("notif-dot")).not.toBeInTheDocument();
  });

  test("amounts in notifications are hidden until 'Show amounts' is pressed", async () => {
    render(<App />);
    await signIn();
    await userEvent.click(await screen.findByRole("button", { name: /^notifications/i }));
    const card = await screen.findByRole("dialog", { name: "Notifications" });
    expect(within(card).getAllByText("Rs. ****").length).toBeGreaterThan(0);
    expect(within(card).queryByText(/Rs\. \d/)).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /show amounts/i }));
    expect(within(card).getAllByText(/Rs\. 60,000/).length).toBeGreaterThan(0);
  });

  test("'View all activity' closes the card and opens the Activity Log", async () => {
    render(<App />);
    await signIn();
    await userEvent.click(await screen.findByRole("button", { name: /^notifications/i }));
    await userEvent.click(await screen.findByRole("button", { name: /view all activity/i }));
    expect(await screen.findByText("What happened")).toBeInTheDocument();
    expect(screen.queryByRole("dialog", { name: "Notifications" })).not.toBeInTheDocument();
  });

  test("if notifications cannot load, the dashboard still works and the card says so", async () => {
    const ok = global.fetch;
    global.fetch = jest.fn((url, opts) => String(url).startsWith("/api/notifications")
      ? Promise.resolve(new Response(JSON.stringify({ error: "x", code: "DATABASE_UNAVAILABLE", requestId: "r" }), { status: 503 }))
      : ok(url, opts));
    render(<App />);
    await signIn();
    expect(await screen.findByText("Total Balance")).toBeInTheDocument();
    expect(screen.queryByTestId("notif-dot")).not.toBeInTheDocument();
    await userEvent.click(bell());
    expect(await screen.findByText(/couldn’t load your notifications/i)).toBeInTheDocument();
  });

  test("Escape closes the card", async () => {
    render(<App />);
    await signIn();
    await userEvent.click(await screen.findByRole("button", { name: /^notifications/i }));
    await screen.findByRole("dialog", { name: "Notifications" });
    await userEvent.keyboard("{Escape}");
    expect(screen.queryByRole("dialog", { name: "Notifications" })).not.toBeInTheDocument();
  });
});

test("login: the password field has an eye button that is always there and shows or hides the password", async () => {
  render(<App />);
  const input = await screen.findByLabelText("Password");
  expect(input).toHaveAttribute("type", "password");
  await userEvent.type(input, "demo1234");
  await userEvent.click(screen.getByRole("button", { name: "Show password" }));
  expect(input).toHaveAttribute("type", "text");
  expect(input).toHaveValue("demo1234");
  await userEvent.click(screen.getByRole("button", { name: "Hide password" }));
  expect(input).toHaveAttribute("type", "password");
});
