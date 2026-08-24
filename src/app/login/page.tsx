import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

const sendMagicLink = async (formData: FormData): Promise<void> => {
  "use server";

  const email = String(formData.get("email") ?? "").trim();
  if (!email) redirect("/login?error=Email%20is%20required");

  const headerStore = await headers();
  const origin = headerStore.get("origin");
  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: origin ? { emailRedirectTo: `${origin}/auth/callback` } : undefined,
  });

  if (error) redirect(`/login?error=${encodeURIComponent(error.message)}`);
  redirect("/login?status=check-email");
};

interface LoginPageProps {
  searchParams: Promise<{ error?: string; status?: string }>;
}

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const params = await searchParams;

  return (
    <main
      style={{
        display: "grid",
        minHeight: "100vh",
        placeItems: "center",
        padding: "1.5rem",
      }}
    >
      <section style={{ width: "min(100%, 28rem)" }}>
        <p style={{ color: "var(--accent)", fontWeight: 700 }}>Private workspace</p>
        <h1>Sign in to your options analyzer</h1>
        <p style={{ color: "var(--muted)", lineHeight: 1.6 }}>
          We will email you a one-time sign-in link. This tool is advisory only and does
          not connect to a brokerage or place trades.
        </p>
        <form action={sendMagicLink} style={{ display: "grid", gap: "0.75rem" }}>
          <label htmlFor="email">Email address</label>
          <input
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            required
            style={{ padding: "0.75rem" }}
          />
          <button type="submit" style={{ padding: "0.75rem", cursor: "pointer" }}>
            Email me a sign-in link
          </button>
        </form>
        {params.status === "check-email" ? (
          <p role="status">Check your email for the one-time sign-in link.</p>
        ) : null}
        {params.error ? (
          <p role="alert" style={{ color: "#ffaaa4" }}>
            {params.error}
          </p>
        ) : null}
      </section>
    </main>
  );
}
