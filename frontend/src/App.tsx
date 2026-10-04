import { useEffect } from "react";
import { useIsAuthenticated, useMsal } from "@azure/msal-react";
import { InteractionStatus } from "@azure/msal-browser";
import { useQuery } from "@tanstack/react-query";
import { Routes, Route } from "react-router-dom";
import Dashboard from "@/pages/Dashboard";
import QuoteBuilder from "@/pages/QuoteBuilder";
import { apiGet, ApiError } from "@/lib/api";
import { apiScope } from "@/lib/entra";
import { endSession } from "@/lib/session";
import { AuthorizationContext, type CurrentUser } from "@/lib/authorization";

function SignIn() {
  const { instance, inProgress } = useMsal();
  const signIn = () => instance.loginRedirect({ scopes: [apiScope] });
  return (
    <main className="grid min-h-svh place-items-center bg-[#f4f4f5] px-6 text-slate-900">
      <section className="w-full max-w-lg border border-slate-200 bg-white p-8 shadow-sm">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-orange-700">NASAKTION</p>
        <h1 className="mt-3 text-2xl font-bold">Quote Generator</h1>
        <p className="mt-3 text-sm leading-6 text-slate-600">Sign in with your company Microsoft work account. Access is limited to employees assigned a Quote Generator role.</p>
        <button type="button" onClick={signIn} disabled={inProgress !== InteractionStatus.None} className="mt-6 w-full bg-orange-600 px-4 py-3 text-sm font-bold text-white hover:bg-orange-700 disabled:opacity-60">
          {inProgress === InteractionStatus.None ? "Sign in with Microsoft" : "Connecting…"}
        </button>
      </section>
    </main>
  );
}

function ProtectedApp() {
  const { instance, inProgress } = useMsal();
  const account = instance.getActiveAccount() ?? instance.getAllAccounts()[0];
  const identityQuery = useQuery({
    queryKey: ["current-user", account?.homeAccountId],
    queryFn: () => apiGet<CurrentUser>("/me"),
    enabled: Boolean(account) && inProgress === InteractionStatus.None,
    retry: false,
  });

  useEffect(() => {
    if (account && instance.getActiveAccount() !== account) instance.setActiveAccount(account);
  }, [account, instance]);

  if (!account) return <SignIn />;
  if (inProgress !== InteractionStatus.None || identityQuery.isLoading) {
    return <main className="grid min-h-svh place-items-center bg-[#f4f4f5] text-sm text-slate-600">Checking your Microsoft account…</main>;
  }

  if (identityQuery.isError) {
    const forbidden = identityQuery.error instanceof ApiError && identityQuery.error.status === 403;
    return (
      <main className="grid min-h-svh place-items-center bg-[#f4f4f5] px-6 text-slate-900">
        <section className="w-full max-w-lg border border-slate-200 bg-white p-8 shadow-sm">
          <h1 className="text-2xl font-bold">{forbidden ? "Access not assigned" : "Could not verify access"}</h1>
          <p className="mt-3 text-sm leading-6 text-slate-600">{forbidden ? "Your account needs the Quote.Admin or Quote.Editor app role in Microsoft Entra. Ask your administrator to assign it, then sign in again." : "The API could not validate your Microsoft sign-in. Check the deployment configuration or try signing in again."}</p>
          <button type="button" onClick={() => void endSession()} className="mt-6 bg-slate-900 px-4 py-3 text-sm font-bold text-white">Sign out</button>
        </section>
      </main>
    );
  }

  const user = identityQuery.data;
  return (
    <>
      <div className="flex items-center justify-end gap-3 border-b border-slate-200 bg-slate-900 px-5 py-2 text-xs text-white">
        <span>{user?.display_name || account.name || account.username} · {user?.roles.join(", ")}</span>
        <button type="button" onClick={() => void endSession()} className="font-semibold underline underline-offset-2">Sign out</button>
      </div>
      <AuthorizationContext.Provider value={user ?? null}>
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/quotes/new" element={<QuoteBuilder />} />
          <Route path="/quotes/:id" element={<QuoteBuilder />} />
          <Route path="*" element={<Dashboard />} />
        </Routes>
      </AuthorizationContext.Provider>
    </>
  );
}

export default function App() {
  const authenticated = useIsAuthenticated();
  const { instance, inProgress } = useMsal();
  if (!authenticated && inProgress === InteractionStatus.None && instance.getAllAccounts().length === 0) return <SignIn />;
  if (!authenticated && inProgress === InteractionStatus.None) return <SignIn />;
  return <ProtectedApp />;
}
