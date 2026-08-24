import type { SupabaseClient } from "@supabase/supabase-js";
import { err, ok, type Result } from "@/lib/result";
import type { Database, TableRow } from "@/lib/supabase/database.types";
import { databaseError, type RepositoryError } from "@/lib/supabase/repository-error";

export type { RepositoryError } from "@/lib/supabase/repository-error";

export interface TraderSource {
  id: string;
  userId: string;
  name: string;
  description: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateTraderSourceInput {
  userId: string;
  name: string;
  description?: string | null;
}

export interface TraderRepository {
  listTraderSources(): Promise<Result<TraderSource[], RepositoryError>>;
  createTraderSource(
    input: CreateTraderSourceInput,
  ): Promise<Result<TraderSource, RepositoryError>>;
}

export const mapTraderSourceRow = (row: TableRow<"trader_sources">): TraderSource => ({
  id: row.id,
  userId: row.user_id,
  name: row.name,
  description: row.description,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

export class SupabaseTraderRepository implements TraderRepository {
  constructor(private readonly client: SupabaseClient<Database>) {}

  async listTraderSources(): Promise<Result<TraderSource[], RepositoryError>> {
    const { data, error } = await this.client
      .from("trader_sources")
      .select("*")
      .order("created_at", { ascending: true });

    if (error) return err(databaseError(error));
    return ok(data.map(mapTraderSourceRow));
  }

  async createTraderSource(
    input: CreateTraderSourceInput,
  ): Promise<Result<TraderSource, RepositoryError>> {
    const { data, error } = await this.client
      .from("trader_sources")
      .insert({
        user_id: input.userId,
        name: input.name,
        description: input.description ?? null,
      })
      .select("*")
      .single();

    if (error) return err(databaseError(error));
    return ok(mapTraderSourceRow(data));
  }
}
