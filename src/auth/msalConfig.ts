import { Configuration, LogLevel } from "@azure/msal-browser";

export type RuntimeMsalConfig = {
  tenantId: string;
  clientId: string;
  redirectUri: string;
};

const resolveRedirectUri = () =>
  (import.meta.env.MODE === "development"
    ? import.meta.env.VITE_AZURE_REDIRECT_URI_DEV
    : import.meta.env.VITE_AZURE_REDIRECT_URI) as string;

export const buildMsalConfig = (runtime?: RuntimeMsalConfig): Configuration => {
  const tenantId = runtime?.tenantId || (import.meta.env.VITE_AZURE_TENANT_ID as string);
  const clientId = runtime?.clientId || (import.meta.env.VITE_AZURE_CLIENT_ID as string);
  const redirectUri = runtime?.redirectUri || resolveRedirectUri();

  return {
    auth: {
      clientId,
      authority: `https://login.microsoftonline.com/${tenantId}`,
      redirectUri,
      postLogoutRedirectUri: redirectUri,
      navigateToLoginRequestUrl: true,
    },
    cache: {
      cacheLocation: "sessionStorage",
      storeAuthStateInCookie: false,
    },
    system: {
      loggerOptions: {
        loggerCallback: (level, message) => {
          if (level === LogLevel.Error) console.error(message);
          if (level === LogLevel.Warning) console.warn(message);
        },
        piiLoggingEnabled: false,
        logLevel: LogLevel.Warning,
      },
    },
  };
};

export const loginRequest = {
  scopes: ["openid", "profile", "email"],
};
