export type GoogleAuthStatus = {
  enabled: boolean;
  message?: string;
};

export function getGoogleAuthStatus(clientId: string | undefined): GoogleAuthStatus {
  if (!clientId) {
    return {
      enabled: false,
      message: "Set VITE_GOOGLE_CLIENT_ID to enable Google sign-in.",
    };
  }

  return { enabled: true };
}
