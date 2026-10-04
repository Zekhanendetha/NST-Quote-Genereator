import {
  BrowserCacheLocation,
  InteractionRequiredAuthError,
  PublicClientApplication,
  type Configuration,
} from "@azure/msal-browser";

const tenantId = (import.meta.env.VITE_ENTRA_TENANT_ID as string | undefined)?.trim() ?? "";
const spaClientId = (import.meta.env.VITE_ENTRA_SPA_CLIENT_ID as string | undefined)?.trim() ?? "";
const apiClientId = (import.meta.env.VITE_ENTRA_API_CLIENT_ID as string | undefined)?.trim() ?? "";
const configuredScope = (import.meta.env.VITE_ENTRA_API_SCOPE as string | undefined)?.trim() ?? "";

export const entraConfigMissing = [
  !tenantId && "VITE_ENTRA_TENANT_ID",
  !spaClientId && "VITE_ENTRA_SPA_CLIENT_ID",
  !apiClientId && "VITE_ENTRA_API_CLIENT_ID",
].filter((value): value is string => Boolean(value));

export const apiScope = configuredScope || (apiClientId ? `api://${apiClientId}/access_as_user` : "");

const configuration: Configuration = {
  auth: {
    // A harmless placeholder keeps module initialization valid while the app displays
    // the missing-configuration screen. Sign-in stays disabled until real IDs are set.
    clientId: spaClientId || "00000000-0000-0000-0000-000000000000",
    authority: `https://login.microsoftonline.com/${tenantId || "organizations"}`,
    redirectUri: window.location.origin,
    postLogoutRedirectUri: window.location.origin,
  },
  cache: {
    cacheLocation: BrowserCacheLocation.SessionStorage,
  },
};

export const msalInstance = new PublicClientApplication(configuration);

export async function acquireApiAccessToken(): Promise<string> {
  if (entraConfigMissing.length || !apiScope) {
    throw new Error("Microsoft Entra is not configured for this deployment.");
  }

  const account = msalInstance.getActiveAccount() ?? msalInstance.getAllAccounts()[0];
  if (!account) throw new Error("Sign in with your Microsoft work account to continue.");
  msalInstance.setActiveAccount(account);

  try {
    const result = await msalInstance.acquireTokenSilent({ account, scopes: [apiScope] });
    return result.accessToken;
  } catch (error) {
    if (error instanceof InteractionRequiredAuthError) {
      await msalInstance.acquireTokenRedirect({ account, scopes: [apiScope] });
      throw new Error("Redirecting to Microsoft sign-in to refresh access.");
    }
    throw error;
  }
}
