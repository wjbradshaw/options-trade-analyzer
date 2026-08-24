import type { PostgrestError } from "@supabase/supabase-js";

export interface RepositoryError {
  code: "database" | "not_found";
  message: string;
}

export const databaseError = (error: PostgrestError): RepositoryError => ({
  code: "database",
  message: error.message,
});

export const notFoundError = (resource: string): RepositoryError => ({
  code: "not_found",
  message: `${resource} was not found`,
});
