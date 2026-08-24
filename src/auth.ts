import { NodeCliAuthorizationClient } from "@itwin/node-cli-authorization";

const DEFAULT_SCOPE = "itwin-platform";

export async function getAccessToken(): Promise<string> {
  const explicitToken = process.env.ITWIN_ACCESS_TOKEN?.trim();
  if (explicitToken) {
    return explicitToken;
  }

  const clientId = process.env.ITWIN_CLIENT_ID?.trim();
  if (!clientId) {
    throw new Error(
      "Set ITWIN_CLIENT_ID to a Bentley Desktop/Mobile application client id, or provide ITWIN_ACCESS_TOKEN.",
    );
  }

  const authClient = new NodeCliAuthorizationClient({
    clientId,
    scope: process.env.ITWIN_SCOPE?.trim() || DEFAULT_SCOPE,
    redirectUri: process.env.ITWIN_REDIRECT_URI?.trim() || undefined,
  });

  await authClient.signIn();
  const token = await authClient.getAccessToken();
  if (!token) {
    throw new Error("Bentley sign-in completed without returning an access token.");
  }

  return token;
}
