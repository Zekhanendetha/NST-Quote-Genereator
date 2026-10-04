import { createContext, useContext } from "react";

export type CurrentUser = { object_id: string; display_name: string; roles: string[] };

export const AuthorizationContext = createContext<CurrentUser | null>(null);

export function useAuthorization(): CurrentUser {
  const user = useContext(AuthorizationContext);
  if (!user) throw new Error("Authorization data is not available outside the authenticated app.");
  return user;
}

export function isAdmin(user: CurrentUser): boolean {
  return user.roles.includes("Quote.Admin");
}
