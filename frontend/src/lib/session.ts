// Clear user-specific cached data at Microsoft sign-in boundaries.
import { queryClient } from "./queryClient";
import { msalInstance } from "./entra";

// Call after every successful login/signup.
export function beginSession(): void {
  queryClient.clear();
}

// MSAL ends the Entra browser session; the API does not keep a server-side cookie session.
export async function endSession(): Promise<void> {
  queryClient.clear();
  const account = msalInstance.getActiveAccount() ?? msalInstance.getAllAccounts()[0];
  await msalInstance.logoutRedirect({ account, postLogoutRedirectUri: window.location.origin });
}
