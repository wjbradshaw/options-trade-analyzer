import AxeBuilder from "@axe-core/playwright";
import {
  expect,
  test,
  type APIRequestContext,
  type BrowserContext,
  type Locator,
  type Page,
} from "@playwright/test";

const mailpitURL = process.env.E2E_MAILPIT_URL ?? "http://127.0.0.1:54324";
const seriousImpacts = new Set(["serious", "critical"]);

interface MailpitMessageSummary {
  ID: string;
  To: Array<{ Address: string }>;
}

interface MailpitMessages {
  messages: MailpitMessageSummary[];
}

interface MailpitMessage {
  Text: string;
}

let authenticatedState: Awaited<
  ReturnType<BrowserContext["storageState"]>
> | null = null;

const expirationForDte = (dte: 0 | 1): string => {
  const expiration = new Date();
  expiration.setUTCDate(expiration.getUTCDate() + dte);
  return `${expiration.getUTCMonth() + 1}/${expiration.getUTCDate()}`;
};

const waitForMagicLink = async (
  request: APIRequestContext,
  email: string,
): Promise<string> => {
  let messageId: string | undefined;

  await expect
    .poll(
      async () => {
        const response = await request.get(
          `${mailpitURL}/api/v1/messages?limit=100`,
        );
        if (!response.ok()) return "";

        const inbox = (await response.json()) as MailpitMessages;
        messageId = inbox.messages.find((message) =>
          message.To.some((recipient) => recipient.Address === email),
        )?.ID;
        return messageId ?? "";
      },
      {
        intervals: [100, 250, 500, 1_000],
        message: `waiting for the passwordless sign-in email for ${email}`,
        timeout: 15_000,
      },
    )
    .not.toBe("");

  if (messageId === undefined)
    throw new Error(`Mailpit did not return a message for ${email}`);
  const response = await request.get(
    `${mailpitURL}/api/v1/message/${messageId}`,
  );
  expect(response.ok()).toBe(true);
  const message = (await response.json()) as MailpitMessage;
  const link = message.Text.match(/https?:\/\/[^\s)]+/)?.[0];
  if (link === undefined)
    throw new Error(
      `Mailpit message for ${email} did not contain a sign-in link`,
    );
  return link;
};

const expectNoSeriousAccessibilityViolations = async (
  page: Page,
  surface: string,
): Promise<void> => {
  const scan = await new AxeBuilder({ page }).analyze();
  const violations = scan.violations.filter((violation) =>
    seriousImpacts.has(violation.impact ?? ""),
  );
  expect(
    violations,
    `${surface} has serious or critical accessibility violations:\n${JSON.stringify(
      violations.map(({ id, impact, help, nodes }) => ({
        id,
        impact,
        help,
        targets: nodes.map((node) => node.target),
      })),
      null,
      2,
    )}`,
  ).toEqual([]);
};

const expectAdvisoryCopy = async (page: Page): Promise<void> => {
  const visibleCopy = await page.locator("body").innerText();
  expect(visibleCopy).toMatch(/advisory only/i);
  expect(visibleCopy).not.toMatch(
    /guaranteed returns?|guaranteed profits?|automatic(?:ally)?\s+(?:execution|execute|trade|order)/i,
  );
};

const enterNumber = async (locator: Locator, value: string): Promise<void> => {
  await locator.pressSequentially(value);
  await expect(locator).toHaveValue(value);
};

const selectSavedTrader = async (page: Page): Promise<void> => {
  const traderSelect = page.getByRole("combobox", { name: "Trader source" });
  await expect
    .poll(() => traderSelect.locator("option").count(), {
      message: "waiting for the authenticated user's saved trader source",
    })
    .toBeGreaterThan(1);
  await traderSelect.selectOption({ index: 1 });
};

const parseAlertAndSelectTrader = async (
  page: Page,
  rawAlert: string,
): Promise<void> => {
  await selectSavedTrader(page);
  await page.getByLabel("Paste trade alert").fill(rawAlert);
  await page.getByRole("button", { name: "Parse alert" }).click();
};

test.describe.serial("Phase One entry analyzer", () => {
  test.beforeEach(async ({ context }, testInfo) => {
    if (
      authenticatedState !== null &&
      !testInfo.title.includes("unauthenticated")
    ) {
      await context.addCookies(authenticatedState.cookies);
    }
  });

  test("redirects unauthenticated dashboard access to the real passwordless login", async ({
    page,
  }) => {
    await page.goto("/");
    await expect(page).toHaveURL(/\/login$/);
    await expect(
      page.getByRole("heading", { name: "Sign in to your options analyzer" }),
    ).toBeVisible();
    await expectAdvisoryCopy(page);
  });

  test("logs in and completes setup, SPX analysis, review refresh, and purchase", async ({
    page,
    request,
  }, testInfo) => {
    const disposableEmail = `phase1-${testInfo.project.name}-${Date.now()}@example.test`;
    const expiration = expirationForDte(0);

    await page.goto("/login");
    await expectNoSeriousAccessibilityViolations(page, "login");
    await page
      .getByRole("textbox", { name: "Email address" })
      .fill(disposableEmail);
    await page.getByRole("button", { name: "Email me a sign-in link" }).click();
    await expect(page.getByRole("status")).toHaveText(
      "Check your email for the one-time sign-in link.",
    );
    await page.goto(await waitForMagicLink(request, disposableEmail));
    await expect(page).toHaveURL(/\/$/);

    await expect(
      page.getByRole("heading", { name: "Set your options budget" }),
    ).toBeVisible();
    await enterNumber(
      page.getByRole("spinbutton", { name: "Options-only trading budget" }),
      "100000",
    );
    await page.getByRole("button", { name: "Save options budget" }).click();
    await expect(
      page.getByRole("heading", { name: "Analyze an options entry" }),
    ).toBeVisible();
    authenticatedState = await page.context().storageState();
    await expectNoSeriousAccessibilityViolations(page, "alert intake");

    await page
      .getByRole("textbox", { name: "New trader source" })
      .fill(`E2E ${testInfo.project.name}`);
    await page.getByRole("button", { name: "Add trader source" }).click();
    await expect(
      page.getByRole("combobox", { name: "Trader source" }),
    ).not.toHaveValue("");

    await page
      .getByLabel("Paste trade alert")
      .fill(`SPX ${expiration} 7810c @2.70`);
    await page.getByRole("button", { name: "Parse alert" }).click();
    await expect(
      page.getByRole("region", { name: "Corrected trade alert" }),
    ).toBeVisible();
    await expectNoSeriousAccessibilityViolations(
      page,
      "corrected alert editor",
    );
    await page.getByRole("combobox", { name: "Call or put" }).selectOption("");
    await expect(
      page.getByRole("button", { name: "Analyze entry" }),
    ).toBeDisabled();
    await page
      .getByRole("combobox", { name: "Call or put" })
      .selectOption("call");
    await page.getByRole("button", { name: "Analyze entry" }).click();

    await page.getByRole("button", { name: "Confirm market snapshot" }).click();
    await expect(
      page
        .getByRole("alert")
        .filter({ hasText: "User-entered option premium" }),
    ).toContainText(/option premium.*underlying price.*required/i);
    await enterNumber(
      page.getByRole("spinbutton", { name: "User-entered option premium" }),
      "2.70",
    );
    await enterNumber(
      page.getByRole("spinbutton", { name: "User-entered underlying price" }),
      "6500",
    );
    await page.getByRole("button", { name: "Confirm market snapshot" }).click();

    const analysis = page.getByRole("region", { name: "Entry analysis" });
    await expect(analysis).toBeVisible();
    await expect(analysis.getByText("Wait", { exact: true })).toBeVisible();
    await expect(analysis).toContainText("setup evidence strength");
    await expect(analysis).toContainText("not probability of profit");
    await expectNoSeriousAccessibilityViolations(page, "analysis");

    await page.getByRole("radio", { name: "Saved for review" }).check();
    await page.getByRole("button", { name: "Save decision" }).click();
    await expect(
      page.getByText("Saved for review.", { exact: true }),
    ).toBeVisible();

    await page.reload();
    const savedReview = page.getByRole("region", { name: "Refresh SPX" });
    await expect(savedReview).toBeVisible();
    await enterNumber(
      savedReview.getByRole("spinbutton", {
        name: "User-entered option premium",
      }),
      "25",
    );
    await enterNumber(
      savedReview.getByRole("spinbutton", {
        name: "User-entered underlying price",
      }),
      "6501",
    );
    await savedReview
      .getByRole("button", { name: "Confirm market snapshot" })
      .click();
    await savedReview.getByRole("button", { name: "Refresh analysis" }).click();
    const refreshResult = savedReview.getByRole("region", {
      name: "Analysis refresh result",
    });
    await expect(refreshResult).toContainText("Before: Wait");
    await expect(refreshResult).toContainText("After: Pass");
    await expect(refreshResult).toContainText("Changed evidence");
    await expect(refreshResult).toContainText("Too aggressive");

    const refreshedDecision = savedReview.getByRole("region", {
      name: "Purchase decision",
    });
    await expect(refreshedDecision).toBeVisible();
    await refreshedDecision.getByRole("radio", { name: "Purchased" }).check();
    await refreshedDecision
      .getByRole("combobox", { name: "Quantity" })
      .selectOption("2");
    await enterNumber(
      refreshedDecision.getByRole("spinbutton", { name: "Actual fill" }),
      "25",
    );
    await refreshedDecision
      .getByRole("textbox", { name: "Actual purchase timestamp" })
      .fill(new Date().toISOString());
    await expectNoSeriousAccessibilityViolations(page, "purchase decision");
    await refreshedDecision
      .getByRole("button", { name: "Save decision" })
      .click();
    await expect(refreshedDecision.getByRole("status")).toHaveText(
      "Purchased decision saved.",
    );
    await expectAdvisoryCopy(page);
    await page.screenshot({
      path: testInfo.outputPath("phase-1-purchase.png"),
      fullPage: true,
    });
  });

  test("blocks missing side and ambiguous update-like alert text", async ({
    page,
  }) => {
    const expiration = expirationForDte(0);
    await page.goto("/");

    await parseAlertAndSelectTrader(page, `SPX ${expiration} 7810 @2.70`);
    await expect(page.getByText("Call or put is required.")).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Analyze entry" }),
    ).toBeDisabled();

    await page
      .getByLabel("Paste trade alert")
      .fill(`SPX ${expiration} 7810c UPDATE 7820c @2.70`);
    await page.getByRole("button", { name: "Parse alert" }).click();
    await expect(page.getByText("Strike is required.")).toBeVisible();
    await expect(page.getByText("Call or put is required.")).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Analyze entry" }),
    ).toBeDisabled();
    await expectAdvisoryCopy(page);
  });

  test("blocks zero-DTE missing prices and one-DTE stale manual evidence", async ({
    page,
  }) => {
    await page.goto("/");
    const pasteFlow = page.getByRole("region", { name: "Paste flow" });
    await parseAlertAndSelectTrader(
      page,
      `SPX ${expirationForDte(0)} 7810c @2.70`,
    );
    await pasteFlow.getByRole("button", { name: "Analyze entry" }).click();
    await pasteFlow
      .getByRole("button", { name: "Confirm market snapshot" })
      .click();
    await expect(
      pasteFlow
        .getByRole("alert")
        .filter({ hasText: "User-entered option premium" }),
    ).toContainText(/required for zero- or one-DTE snapshots/i);

    await pasteFlow
      .getByLabel("Paste trade alert")
      .fill(`SPX ${expirationForDte(1)} 7810c @2.70`);
    await pasteFlow.getByRole("button", { name: "Parse alert" }).click();
    await pasteFlow.getByRole("button", { name: "Analyze entry" }).click();
    await page.clock.setFixedTime(new Date(Date.now() - 16 * 60 * 1_000));
    await enterNumber(
      pasteFlow.getByRole("spinbutton", {
        name: "User-entered option premium",
      }),
      "2.70",
    );
    await enterNumber(
      pasteFlow.getByRole("spinbutton", {
        name: "User-entered underlying price",
      }),
      "6500",
    );
    await pasteFlow
      .getByRole("button", { name: "Confirm market snapshot" })
      .click();
    await expect(
      page.getByRole("region", { name: "Needs attention" }),
    ).toContainText(
      "Confirm current option premium and underlying price before scoring this short-dated contract.",
    );
    await expect(
      page.getByRole("region", { name: "Entry analysis" }),
    ).not.toBeVisible();
  });

  test("labels risk above two percent Too aggressive and returns Pass", async ({
    page,
  }) => {
    await page.goto("/");
    const pasteFlow = page.getByRole("region", { name: "Paste flow" });
    await parseAlertAndSelectTrader(
      page,
      `SPX ${expirationForDte(0)} 7810c @25`,
    );
    await pasteFlow.getByRole("button", { name: "Analyze entry" }).click();
    await enterNumber(
      pasteFlow.getByRole("spinbutton", {
        name: "User-entered option premium",
      }),
      "25",
    );
    await enterNumber(
      pasteFlow.getByRole("spinbutton", {
        name: "User-entered underlying price",
      }),
      "6500",
    );
    await pasteFlow
      .getByRole("button", { name: "Confirm market snapshot" })
      .click();
    const analysis = pasteFlow.getByRole("region", { name: "Entry analysis" });
    await expect(analysis.getByText("Pass", { exact: true })).toBeVisible();
    await expect(analysis).toContainText("Too aggressive");
    await expectAdvisoryCopy(page);
  });

  test("shows the real trader repository failure UI from a failed Supabase REST request", async ({
    page,
  }) => {
    await page.route("**/rest/v1/trader_sources*", async (route) => {
      await route.fulfill({
        body: JSON.stringify({
          code: "XX000",
          details: null,
          hint: null,
          message: "Trader source repository unavailable.",
        }),
        contentType: "application/json",
        status: 500,
      });
    });
    await page.goto("/");
    await expect(
      page
        .getByRole("alert")
        .filter({ hasText: "Trader source repository unavailable." }),
    ).toHaveText("Trader source repository unavailable.");
  });
});
