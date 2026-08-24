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

  it("shows the deterministic confirmation time after a successful submission (mutation: omit the visible capture-time confirmation)", async () => {
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
      "Confirmed at: 2026-08-14T15:00:00.000Z",
    );
  });
});
