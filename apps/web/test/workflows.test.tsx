import React from "react";
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import {
  render,
  screen,
  cleanup,
  waitFor,
  within,
  fireEvent,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import FlowMind from "../components/FlowMind";
beforeEach(() => {
  localStorage.clear();
  window.location.hash = "";
  window.scrollTo = vi.fn();
  HTMLElement.prototype.scrollIntoView = vi.fn();
  Object.defineProperty(navigator, "clipboard", {
    value: { writeText: vi.fn().mockResolvedValue(undefined) },
    configurable: true,
  });
});
afterEach(cleanup);
describe("workspace workflows", () => {
  it("navigates to a meeting and searches its transcript", async () => {
    const user = userEvent.setup();
    render(<FlowMind />);
    await user.click(
      await screen.findByRole("button", {
        name: /FlowMind beta · Sprint planning/,
      }),
    );
    await user.click(screen.getByRole("button", { name: "Transcript" }));
    const field = screen.getByPlaceholderText("Search this transcript…");
    await user.type(field, "resumable");
    await waitFor(() => {
      expect(screen.getAllByText("David Okafor").length).toBeGreaterThan(0);
    });
    expect(document.querySelectorAll(".transcript-segment").length).toBe(1);
  });
  it("creates and edits a manual action and persists the change", async () => {
    const user = userEvent.setup();
    render(<FlowMind />);
    await user.click(screen.getByRole("button", { name: /Action items/ }));
    await user.click(screen.getByRole("button", { name: "Add manual item" }));
    const dialog = screen.getByRole("dialog", { name: "New action item" });
    await user.type(
      within(dialog).getByLabelText("Action item"),
      "Send the QA report",
    );
    await user.click(
      within(dialog).getByRole("button", { name: "Create action" }),
    );
    await screen.findByRole("button", { name: /Send the QA report/ });
    await user.click(
      screen.getByRole("button", { name: /Send the QA report/ }),
    );
    const detail = screen.getByRole("dialog", { name: "Action details" });
    await user.selectOptions(within(detail).getByLabelText("Status"), "done");
    await user.click(
      within(detail).getByRole("button", { name: "Save changes" }),
    );
    await waitFor(() => {
      const saved = JSON.parse(
        localStorage.getItem("flowmind-demo-v1") || "{}",
      );
      expect(
        saved.actions.find((a: any) => a.title === "Send the QA report").status,
      ).toBe("done");
    });
  });
  it("saves notification quiet hours", async () => {
    const user = userEvent.setup();
    render(<FlowMind />);
    await user.click(screen.getByRole("button", { name: "Settings" }));
    await user.click(screen.getByRole("button", { name: "Notifications" }));
    await user.selectOptions(screen.getByLabelText("Start"), "21");
    await user.click(screen.getByRole("button", { name: "Save preferences" }));
    await waitFor(() =>
      expect(
        JSON.parse(localStorage.getItem("flowmind-demo-v1") || "{}").settings
          .quietStart,
      ).toBe(21),
    );
  });
  it("creates a scoped demonstration key and reveals it once", async () => {
    const user = userEvent.setup();
    window.location.hash = "settings/api-keys";
    render(<FlowMind />);
    await user.click(await screen.findByRole("button", { name: "Create key" }));
    await user.type(screen.getByLabelText("Key name"), "QA key");
    await user.click(screen.getByRole("button", { name: "Generate key" }));
    await screen.findByText("Your key is ready");
    expect(within(screen.getByRole("dialog", {name:"Your key is ready"})).getByText(/^fm_demo_/).textContent).toContain("fm_demo_");
    await user.click(screen.getByRole("button", { name: "Close dialog" }));
    expect(screen.queryByText("Your key is ready")).toBeNull();
    expect(
      JSON.parse(localStorage.getItem("flowmind-demo-v1") || "{}").keys[0],
    ).not.toHaveProperty("value");
  });
});
