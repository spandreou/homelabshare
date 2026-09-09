import Link from "next/link";
import { LoginErrorToast } from "../components/LoginErrorToast";
import { PendingSubmitButton } from "../components/PendingSubmitButton";
import { RegisterActivationForm } from "../components/RegisterActivationForm";
import { ResponsiveLightfall } from "../components/ResponsiveLightfall";

export const dynamic = "force-dynamic";

type LandingPageProps = {
  searchParams: Promise<{
    loginError?: string | string[];
  }>;
};

function loginErrorMessage(code: string | null) {
  return code === "invalid-email"
    ? "Please enter a valid email address."
    : code === "rate-limited"
      ? "Too many login attempts. Please wait a minute and try again."
      : code === "invalid"
        ? "Invalid email or password."
        : code === "session"
          ? "Could not start your session right now. Please try again."
          : null;
}

export default async function LandingPage({ searchParams }: LandingPageProps) {
  const params = await searchParams;
  const loginErrorCode = Array.isArray(params.loginError) ? params.loginError[0] : params.loginError;
  const loginError = loginErrorMessage(loginErrorCode ?? null);

  return (
    <main className="relative isolate min-h-screen overflow-hidden bg-[#061066] px-6 py-12 text-zinc-900 dark:text-zinc-100">
      <LoginErrorToast message={loginError} />
      <div
        aria-hidden="true"
        className="absolute inset-0 z-0 bg-[radial-gradient(circle_at_top,rgba(82,39,255,0.55),rgba(10,41,255,0.18)_34%,rgba(2,4,24,0.92)_82%)]"
      >
        <ResponsiveLightfall
          colors={["#A6C8FF", "#5227FF", "#FF9FFC"]}
          backgroundColor="#0A29FF"
          speed={0.5}
          streakCount={3}
          streakWidth={1}
          streakLength={1}
          glow={0.8}
          density={0.7}
          twinkle={1}
          zoom={2.3}
          backgroundGlow={0.3}
          opacity={1}
          mouseInteraction={false}
          mouseStrength={0.5}
          mouseRadius={0.65}
        />
      </div>
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 z-0 bg-[radial-gradient(circle_at_top,rgba(255,255,255,0.55),rgba(255,255,255,0.28)_35%,rgba(7,10,48,0.42)_78%)] dark:bg-[radial-gradient(circle_at_top,rgba(255,255,255,0.08),rgba(7,10,48,0.18)_36%,rgba(2,4,24,0.58)_82%)]"
      />
      <div className="relative z-10 mx-auto flex min-h-[80vh] max-w-6xl flex-col justify-center">
        <header className="mb-10 text-center">
          <h1 className="text-4xl font-bold tracking-tight transition-shadow dark:drop-shadow-[0_0_22px_rgba(34,197,94,0.45)] sm:text-5xl">
            <span className="text-green-600">homeLab</span>Share
          </h1>
          <p className="mt-3 text-zinc-600 dark:text-zinc-400">Private Cloud Storage with invite-only access</p>
          <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-500">
            Need an activation code?{" "}
            <Link href="/request" className="text-green-600 hover:text-green-500 dark:text-green-400 dark:hover:text-green-300">
              Request access
            </Link>
          </p>
        </header>

        <div className="grid gap-6 md:grid-cols-2">
          <section className="rounded-2xl border border-zinc-200 bg-white/90 p-6 backdrop-blur dark:border-zinc-800 dark:bg-zinc-900/70">
            <h2 className="text-xl font-semibold">Login</h2>
            <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">For existing members.</p>

            <form action="/api/auth/login" method="post" className="mt-6 space-y-4">
              <input
                name="email"
                type="email"
                placeholder="Email"
                autoComplete="email"
                className="w-full rounded-md border border-zinc-300 bg-zinc-50 px-4 py-3 outline-none focus:border-green-600 focus:ring-2 focus:ring-green-600/30 dark:border-zinc-700 dark:bg-zinc-950"
                required
              />
              <input
                name="password"
                type="password"
                placeholder="Password"
                autoComplete="current-password"
                className="w-full rounded-md border border-zinc-300 bg-zinc-50 px-4 py-3 outline-none focus:border-green-600 focus:ring-2 focus:ring-green-600/30 dark:border-zinc-700 dark:bg-zinc-950"
                required
              />

              {loginError ? (
                <p className="rounded-md border border-red-900/60 bg-red-950/40 px-3 py-2 text-sm text-red-300">
                  {loginError}
                </p>
              ) : null}

              <PendingSubmitButton idleLabel="Login" pendingLabel="Signing in..." />
            </form>
          </section>

          <section className="rounded-2xl border border-zinc-200 bg-white/90 p-6 backdrop-blur dark:border-zinc-800 dark:bg-zinc-900/70">
            <h2 className="text-xl font-semibold">Redeem Activation</h2>
            <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">Create a new account with your email and activation code.</p>
            <RegisterActivationForm />
          </section>
        </div>
      </div>
    </main>
  );
}
