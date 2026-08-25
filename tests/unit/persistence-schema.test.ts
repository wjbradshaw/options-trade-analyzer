import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve(process.cwd(), "supabase/migrations/0001_phase1.sql"),
  "utf8",
).replace(/\s+/g, " ");
const workflowMigrationPath = resolve(
  process.cwd(),
  "supabase/migrations/0002_analysis_workflow_rpc.sql",
);

describe("confirmed option-contract persistence", () => {
  it("only permits confirmation when all required option fields are present", () => {
    expect(migration).toMatch(/contract_confirmed boolean not null default false/);
    expect(migration).toMatch(
      /check \( not contract_confirmed or \( symbol is not null and option_side is not null and strike is not null and strike > 0 and expiration is not null \) \)/,
    );
  });

  it("only permits analysis of a same-user confirmed alert", () => {
    expect(migration).toMatch(
      /alert_contract_confirmed boolean not null default true check \(alert_contract_confirmed\)/,
    );
    expect(migration).toMatch(
      /foreign key \(trade_alert_id, user_id, alert_contract_confirmed\) references public\.trade_alerts \(id, user_id, contract_confirmed\)/,
    );
  });
});

describe("same-user relationship constraints", () => {
  it("ties alerts to a trader source owned by the same user", () => {
    expect(migration).toMatch(
      /foreign key \(trader_source_id, user_id\) references public\.trader_sources \(id, user_id\)/,
    );
  });

  it("ties snapshots to an alert owned by the same user", () => {
    expect(migration).toMatch(
      /foreign key \(trade_alert_id, user_id\) references public\.trade_alerts \(id, user_id\)/,
    );
  });

  it("ties an analysis snapshot to the same user and alert", () => {
    expect(migration).toMatch(
      /foreign key \(market_snapshot_id, user_id, trade_alert_id\) references public\.market_snapshots \(id, user_id, trade_alert_id\)/,
    );
  });

  it("ties decisions to an alert and analysis owned by the same user", () => {
    expect(migration).toMatch(
      /foreign key \(entry_analysis_id, user_id, trade_alert_id\) references public\.entry_analyses \(id, user_id, trade_alert_id\)/,
    );
    expect(migration).toMatch(
      /trade_decisions_alert_owner_fkey foreign key \(trade_alert_id, user_id\) references public\.trade_alerts \(id, user_id\)/,
    );
  });

  it("ties candidates and both analyses to the same user and alert", () => {
    expect(migration).toMatch(
      /watch_candidates_alert_owner_fkey foreign key \(trade_alert_id, user_id\) references public\.trade_alerts \(id, user_id\)/,
    );
    expect(migration).toMatch(
      /foreign key \(latest_analysis_id, user_id, trade_alert_id\) references public\.entry_analyses \(id, user_id, trade_alert_id\)/,
    );
  });

  it("defines unique owner keys required by the composite foreign keys", () => {
    expect(migration).toMatch(/trader_sources_owner_key unique \(id, user_id\)/);
    expect(migration).toMatch(/trade_alerts_owner_key unique \(id, user_id\)/);
    expect(migration).toMatch(
      /market_snapshots_owner_alert_key unique \(id, user_id, trade_alert_id\)/,
    );
    expect(migration).toMatch(
      /entry_analyses_owner_alert_key unique \(id, user_id, trade_alert_id\)/,
    );
  });
});

describe("watch-candidate source semantics", () => {
  it("only permits a Wait analysis from the same user and alert as the source", () => {
    expect(migration).toMatch(
      /source_analysis_verdict text not null default 'Wait' check \(source_analysis_verdict = 'Wait'\)/,
    );
    expect(migration).toMatch(
      /entry_analyses_owner_alert_verdict_key unique \(id, user_id, trade_alert_id, verdict\)/,
    );
    expect(migration).toMatch(
      /foreign key \(source_analysis_id, user_id, trade_alert_id, source_analysis_verdict\) references public\.entry_analyses \(id, user_id, trade_alert_id, verdict\)/,
    );
  });
});

describe("transactional analysis workflow", () => {
  it("commits alert, snapshot, and completed analysis inside one authenticated RPC", () => {
    const workflowMigration = readFileSync(workflowMigrationPath, "utf8").replace(
      /\s+/g,
      " ",
    );

    expect(workflowMigration).toMatch(
      /create or replace function public\.commit_entry_analysis_workflow/,
    );
    expect(workflowMigration).toMatch(/if auth\.uid\(\) is distinct from p_user_id/);
    expect(workflowMigration).toMatch(/insert into public\.trade_alerts/);
    expect(workflowMigration).toMatch(/insert into public\.market_snapshots/);
    expect(workflowMigration).toMatch(/insert into public\.entry_analyses/);
    expect(workflowMigration).toMatch(/revoke all on function .* from public, anon/);
    expect(workflowMigration).toMatch(/grant execute on function .* to authenticated/);
    expect(workflowMigration).toMatch(
      /create or replace function public\.commit_wait_candidate_refresh/,
    );
    expect(workflowMigration).toMatch(
      /update public\.watch_candidates set latest_analysis_id = v_analysis_id/,
    );
  });
});
