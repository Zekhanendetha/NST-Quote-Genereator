import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { QueryClientProvider } from '@tanstack/react-query'
import { BrowserRouter } from 'react-router-dom'
import { Toaster } from '@/components/ui/sonner'
import { MsalProvider } from '@azure/msal-react'
import './index.css'
import App from './App.tsx'
import { queryClient } from './lib/queryClient'
import { entraConfigMissing, msalInstance } from './lib/entra'

const root = createRoot(document.getElementById('root')!)

if (entraConfigMissing.length) {
  root.render(
    <main className="grid min-h-svh place-items-center bg-[#f4f4f5] px-6 text-slate-900">
      <section className="w-full max-w-xl border border-slate-200 bg-white p-8 shadow-sm">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-orange-700">Microsoft sign-in setup</p>
        <h1 className="mt-3 text-2xl font-bold">Configuration is needed</h1>
        <p className="mt-3 text-sm leading-6 text-slate-600">Add these public Entra app identifiers to this deployment's frontend environment, then rebuild the website:</p>
        <ul className="mt-4 list-inside list-disc space-y-1 font-mono text-sm text-slate-700">
          {entraConfigMissing.map((name) => <li key={name}>{name}</li>)}
        </ul>
        <p className="mt-4 text-xs text-slate-500">Do not put a client secret in frontend variables.</p>
      </section>
    </main>,
  )
} else {
  void msalInstance.initialize().then(async () => {
    const redirectResult = await msalInstance.handleRedirectPromise()
    const account = redirectResult?.account ?? msalInstance.getAllAccounts()[0]
    if (account) msalInstance.setActiveAccount(account)
    root.render(
      <StrictMode>
        <MsalProvider instance={msalInstance}>
          <QueryClientProvider client={queryClient}>
            <BrowserRouter>
              <App />
            </BrowserRouter>
            <Toaster data-testid="app-toast-region" />
          </QueryClientProvider>
        </MsalProvider>
      </StrictMode>,
    )
  }).catch((error: unknown) => {
    console.error("Microsoft sign-in initialization failed", error)
    root.render(<main className="grid min-h-svh place-items-center bg-[#f4f4f5] px-6 text-slate-900"><section className="max-w-lg border border-slate-200 bg-white p-8"><h1 className="text-xl font-bold">Microsoft sign-in could not start</h1><p className="mt-3 text-sm text-slate-600">Refresh this page. If the problem continues, check the Entra redirect URI and frontend configuration.</p></section></main>)
  })
}
