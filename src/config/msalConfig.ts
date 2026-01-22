import { PublicClientApplication } from '@azure/msal-browser';

const isDev = window.location.hostname === 'localhost';
const redirectUri = isDev 
  ? 'http://localhost:5173/auth/callback'
  : 'https://opportunitydash.onrender.com/auth/callback';

export const msalConfig = {
  auth: {
    clientId: 'b507bc53-ce4a-48cb-9fd2-6aa8c8e10464',
    authority: 'https://login.microsoftonline.com/18308545-013f-4a2f-9774-5516497b3c54',
    redirectUri: redirectUri,
  },
  cache: {
    cacheLocation: 'localStorage',
    storeAuthStateInCookie: false,
  },
};

export const loginRequest = {
  scopes: ['User.Read'],
};

export const msalInstance = new PublicClientApplication(msalConfig);
