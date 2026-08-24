// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { err, ok, type Result } from "@/lib/result";
import { AlertPasteForm } from "@/features/alerts/ui/alert-paste-form";
import type { RepositoryError } from "@/features/traders/server/trader-repository";
import type {
  CreateTraderSourceInput,
  TraderRepository,
  TraderSource,
} from "@/features/traders/server/trader-repository";

const source: TraderSource = {
  id: "source-1",
  userId: "user-1",
  name: "Private Discord trader",
  description: "Manually pasted alerts only",
  createdAt: "2026-08-14T15:00:00.000Z",
  updatedAt: "2026-08-14T15:00:00.000Z",
};

class InMemoryTraderRepository implements TraderRepository {
  sources: TraderSource[];

  constructor(sources: TraderSource[] = [source]) {
    this.sources = [...sources];
  }

  async listTraderSources(): Promise<Result<TraderSource[], RepositoryError>> {
    return ok(this.sources);
  }

  async createTraderSource(
    input: CreateTraderSourceInput,
  ): Promise<Result<TraderSource, RepositoryError>> {
    const created: TraderSource = {
      id: `source-${this.sources.length + 1}`,
      userId: input.userId,
      name: input.name,
      description: input.description ?? null,
      createdAt: "2026-08-14T15:00:00.000Z",
      updatedAt: "2026-08-14T15:00:00.000Z",
    };
    this.sources.push(created);
    return ok(created);
  }
}

const renderForm = (
  repository: TraderRepository = new InMemoryTraderRepository(),
  onAnalyze = vi.fn(),
) => {
  render(
    <AlertPasteForm
      traderRepository={repository}
      userId="user-1"
      submittedAt={() => "2026-08-14T15:00:00.000Z"}
      onAnalyze={onAnalyze}
    />,
  );
  return onAnalyze;
};

describe("AlertPasteForm", () => {
  afterEach(cleanup);

  it("parses a private pasted alert into a preview with its raw text", async () => {
    const user = userEvent.setup();
    renderForm();

    await user.type(
      screen.getByLabelText(/paste trade alert/i),
      "NBIS 8/14 220c @2.98 ER LOTTO",
    );
    await user.click(screen.getByRole("button", { name: /parse alert/i }));

    expect(screen.getByLabelText(/ticker/i)).toHaveValue("NBIS");
    expect(screen.getByLabelText("Original pasted alert text")).toHaveTextContent(
      "NBIS 8/14 220c @2.98 ER LOTTO",
    );
  });

  it("submits the corrected contract while preserving the raw pasted text", async () => {
    const user = userEvent.setup();
    const onAnalyze = renderForm();

    await user.type(screen.getByLabelText(/paste trade alert/i), "NBIS 8/14 220c @2.98");
    await user.click(screen.getByRole("button", { name: /parse alert/i }));
    await user.clear(screen.getByLabelText(/strike/i));
    await user.type(screen.getByLabelText(/strike/i), "225");
    await user.selectOptions(
      screen.getByRole("combobox", { name: "Trader source" }),
      source.id,
    );
    await user.click(screen.getByRole("button", { name: /analyze entry/i }));

    expect(onAnalyze).toHaveBeenCalledWith(
      expect.objectContaining({
        rawText: "NBIS 8/14 220c @2.98",
        symbol: "NBIS",
        side: "call",
        strike: 225,
        expiration: "8/14",
      }),
      source,
    );
  });

  it("creates and selects a trader source for the current user", async () => {
    const user = userEvent.setup();
    const repository = new InMemoryTraderRepository([]);
    renderForm(repository);

    await user.type(screen.getByLabelText(/new trader source/i), "Private room");
    await user.click(screen.getByRole("button", { name: /add trader source/i }));

    await waitFor(() =>
      expect(screen.getByRole("combobox", { name: "Trader source" })).toHaveValue("source-1"),
    );
    expect(repository.sources).toEqual([
      expect.objectContaining({ userId: "user-1", name: "Private room" }),
    ]);
  });

  it("keeps a newly created source selected when the initial source list resolves later", async () => {
    const user = userEvent.setup();
    let resolveList!: (result: Result<TraderSource[], RepositoryError>) => void;
    const createdSource: TraderSource = {
      ...source,
      id: "source-2",
      name: "Late-created private room",
    };
    const repository: TraderRepository = {
      listTraderSources: () =>
        new Promise<Result<TraderSource[], RepositoryError>>((resolve) => {
          resolveList = resolve;
        }),
      createTraderSource: async () => ok(createdSource),
    };
    renderForm(repository);

    await user.type(screen.getByLabelText(/new trader source/i), createdSource.name);
    await user.click(screen.getByRole("button", { name: /add trader source/i }));
    expect(screen.getByRole("combobox", { name: "Trader source" })).toHaveValue(
      createdSource.id,
    );

    resolveList(ok([]));

    await waitFor(() =>
      expect(screen.getByRole("combobox", { name: "Trader source" })).toHaveValue(
        createdSource.id,
      ),
    );
    expect(screen.getByRole("option", { name: createdSource.name })).toBeVisible();
  });

  it("keeps analysis disabled and names missing critical fields", async () => {
    const user = userEvent.setup();
    renderForm();

    await user.type(screen.getByLabelText(/paste trade alert/i), "NBIS 8/14 @2.98");
    await user.click(screen.getByRole("button", { name: /parse alert/i }));

    expect(screen.getByRole("button", { name: /analyze entry/i })).toBeDisabled();
    expect(screen.getByText(/strike is required/i)).toBeVisible();
    expect(screen.getByText(/call or put is required/i)).toBeVisible();
  });

  it("keeps analysis disabled for a malformed corrected expiration", async () => {
    const user = userEvent.setup();
    renderForm();

    await user.type(screen.getByLabelText(/paste trade alert/i), "NBIS 8/14 220c @2.98");
    await user.click(screen.getByRole("button", { name: /parse alert/i }));
    await user.clear(screen.getByLabelText(/expiration/i));
    await user.type(screen.getByLabelText(/expiration/i), "14/99");
    await user.selectOptions(
      screen.getByRole("combobox", { name: "Trader source" }),
      source.id,
    );

    expect(screen.getByRole("button", { name: /analyze entry/i })).toBeDisabled();
    expect(screen.getByText("Expiration must use a valid MM/DD date.")).toBeVisible();
  });

  it("shows trader repository errors visibly", async () => {
    const user = userEvent.setup();
    const repository: TraderRepository = {
      listTraderSources: async () => err({ code: "database", message: "List failed" }),
      createTraderSource: async () => err({ code: "database", message: "Create failed" }),
    };
    renderForm(repository);

    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("List failed"));
    await user.type(screen.getByLabelText(/new trader source/i), "Private room");
    await user.click(screen.getByRole("button", { name: /add trader source/i }));

    expect(screen.getByRole("alert")).toHaveTextContent("Create failed");
  });
});
