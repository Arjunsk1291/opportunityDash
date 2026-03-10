import { PublicClientApplication } from "@azure/msal-browser";
import { buildMsalConfig, RuntimeMsalConfig } from "./msalConfig";

let msalInstance: PublicClientApplication | null = null;

export const initMsal = async (runtime?: RuntimeMsalConfig) => {
  msalInstance = new PublicClientApplication(buildMsalConfig(runtime));
  await msalInstance.initialize();
  return msalInstance;
};

export const getMsalInstance = () => {
  if (!msalInstance) {
    msalInstance = new PublicClientApplication(buildMsalConfig());
  }
  return msalInstance;
};
