import LandingClient from "../components/LandingClient";

export const dynamic = "force-dynamic";

type LandingPageProps = {
  searchParams: Promise<{
    loginError?: string | string[];
  }>;
};

export default async function LandingPage({ searchParams }: LandingPageProps) {
  const params = await searchParams;
  const loginError = Array.isArray(params.loginError) ? params.loginError[0] : params.loginError;

  return <LandingClient loginErrorCode={loginError ?? null} />;
}
