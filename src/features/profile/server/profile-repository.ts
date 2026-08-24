import type { SupabaseClient } from "@supabase/supabase-js";
import { err, ok, type Result } from "@/lib/result";
import type { Database, TableRow } from "@/lib/supabase/database.types";
import {
  databaseError,
  notFoundError,
  type RepositoryError,
} from "@/lib/supabase/repository-error";

export type { RepositoryError } from "@/lib/supabase/repository-error";

export interface Profile {
  userId: string;
  optionsBudget: number;
  createdAt: string;
  updatedAt: string;
}

export interface UpsertProfileInput {
  userId: string;
  optionsBudget: number;
}

export interface ProfileRepository {
  getProfile(): Promise<Result<Profile, RepositoryError>>;
  upsertProfile(input: UpsertProfileInput): Promise<Result<Profile, RepositoryError>>;
}

export const mapProfileRow = (row: TableRow<"profiles">): Profile => ({
  userId: row.user_id,
  optionsBudget: row.options_budget,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

export class SupabaseProfileRepository implements ProfileRepository {
  constructor(private readonly client: SupabaseClient<Database>) {}

  async getProfile(): Promise<Result<Profile, RepositoryError>> {
    const { data, error } = await this.client.from("profiles").select("*").maybeSingle();

    if (error) return err(databaseError(error));
    if (!data) return err(notFoundError("Profile"));
    return ok(mapProfileRow(data));
  }

  async upsertProfile(input: UpsertProfileInput): Promise<Result<Profile, RepositoryError>> {
    const { data, error } = await this.client
      .from("profiles")
      .upsert(
        { user_id: input.userId, options_budget: input.optionsBudget },
        { onConflict: "user_id" },
      )
      .select("*")
      .single();

    if (error) return err(databaseError(error));
    return ok(mapProfileRow(data));
  }
}
