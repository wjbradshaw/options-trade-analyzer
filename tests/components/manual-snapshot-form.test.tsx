// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ManualSnapshotForm } from "@/features/market/ui/manual-snapshot-form";

describe("ManualSnapshotForm", () => {
  afterEach(cleanup);

  it("labels both price fields as user-entered (mutation: omit an accessible field label)", () => {
    render(
      <ManualSnapshotForm dte={1} onConfirm={() => undefined} />,
    );

    expect(
      screen.getByRole("spinbutton", { name: "User-entered option premium" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("spinbutton", { name: "User-entered underlying price" }),
    ).toBeInTheDocument();
  });

  it("submits both manual price values (mutation: discard a submitted price value)", async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();

    render(
      <ManualSnapshotForm
        dte={1}
        now={() => new Date("2026-08-14T15:00:00.000Z")}
        onConfirm={onConfirm}
      />,
    );

    await user.type(
      screen.getByRole("spinbutton", { name: "User-entered option premium" }),
      "2.7",
    );
    await user.type(
      screen.getByRole("spinbutton", { name: "User-entered underlying price" }),
      "7800",
    );
    await user.click(screen.getByRole("button", { name: "Confirm market snapshot" }));

    expect(onConfirm).toHaveBeenCalledWith({
      optionPremium: 2.7,
      underlyingPrice: 7800,
      confirmedAt: "2026-08-14T15:00:00.000Z",
    });
  });

  it("blocks a blank zero-DTE submission and names both missing user-entered fields (mutation: confirm before evaluating short-DTE freshness)", async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();

    render(
      <ManualSnapshotForm
        dte={0}
        now={() => new Date("2026-08-14T15:00:00.000Z")}
        onConfirm={onConfirm}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Confirm market snapshot" }));

    expect(onConfirm).not.toHaveBeenCalled();
    expect(screen.getByRole("alert")).toHaveTextContent(
      "User-entered option premium and user-entered underlying price are required for zero- or one-DTE snapshots.",
    );
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("rejects a non-positive user-entered price with an accessible field-specific error (mutation: accept a zero price after form submission)", async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();

    render(
      <ManualSnapshotForm
        dte={1}
        now={() => new Date("2026-08-14T15:00:00.000Z")}
        onConfirm={onConfirm}
      />,
    );

    await user.type(
      screen.getByRole("spinbutton", { name: "User-entered option premium" }),
      "0",
    );
    await user.type(
      screen.getByRole("spinbutton", { name: "User-entered underlying price" }),
      "7800",
    );
    await user.click(screen.getByRole("button", { name: "Confirm market snapshot" }));

    expect(onConfirm).not.toHaveBeenCalled();
    expect(screen.getByRole("alert")).toHaveTextContent(
      "User-entered option premium must be a positive number.",
    );
  });

  it("allows a blank longer-dated snapshot (mutation: apply the short-DTE price block to all DTE values)", async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();

    render(
      <ManualSnapshotForm
        dte={5}
        now={() => new Date("2026-08-14T15:00:00.000Z")}
        onConfirm={onConfirm}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Confirm market snapshot" }));

    expect(onConfirm).toHaveBeenCalledWith({
      optionPremium: null,
      underlyingPrice: null,
      confirmedAt: "2026-08-14T15:00:00.000Z",
    });
  });

  it("shows capture time and freshness after a successful longer-dated submission (mutation: omit the visible capture-time confirmation)", async () => {
    const user = userEvent.setup();

    render(
      <ManualSnapshotForm
        dte={5}
        now={() => new Date("2026-08-14T15:00:00.000Z")}
        onConfirm={() => undefined}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Confirm market snapshot" }));

    expect(screen.getByRole("status")).toHaveTextContent(
      "Confirmed at: 2026-08-14T15:00:00.000Z. Freshness: fresh.",
    );
  });

  it("uses unique field identifiers when multiple saved candidates render refresh forms", () => {
    render(
      <>
        <ManualSnapshotForm idPrefix="candidate-a" dte={5} onConfirm={() => undefined} />
        <ManualSnapshotForm idPrefix="candidate-b" dte={5} onConfirm={() => undefined} />
      </>,
    );

    expect(document.querySelectorAll("#candidate-a-option-premium")).toHaveLength(1);
    expect(document.querySelectorAll("#candidate-b-option-premium")).toHaveLength(1);
    expect(document.querySelectorAll("#candidate-a-underlying-price")).toHaveLength(1);
    expect(document.querySelectorAll("#candidate-b-underlying-price")).toHaveLength(1);
  });
});
