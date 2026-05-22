const TOKEN_KEY = "its-auth-token";
let sessionExpiredHandled = false;

export function getToken(): string | null {
  return window.localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string): void {
  sessionExpiredHandled = false;
  window.localStorage.setItem(TOKEN_KEY, token);
}

export function clearToken(): void {
  window.localStorage.removeItem(TOKEN_KEY);
}

export function isAuthenticated(): boolean {
  return getToken() !== null;
}

export function handleSessionExpired(): void {
  if (sessionExpiredHandled) return;
  sessionExpiredHandled = true;
  clearToken();
  if (window.location.pathname !== "/") {
    window.location.replace("/");
  }
}
