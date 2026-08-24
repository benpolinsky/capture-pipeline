import { NodeCliAuthorizationClient } from "@itwin/node-cli-authorization";

const DEFAULT_SCOPE = "itwin-platform";

export async function getAccessToken(): Promise<string> {
  const explicitToken = process.env.ITWIN_ACCESS_TOKEN?.trim();
  if (explicitToken) {
    return stripBearerPrefix(explicitToken);
  }

  const clientId = process.env.ITWIN_CLIENT_ID?.trim();
  if (!clientId) {
    throw new Error(
      "Set ITWIN_CLIENT_ID to a Bentley Desktop/Mobile application client id, or provide ITWIN_ACCESS_TOKEN.",
    );
  }

  const authClient = new NodeCliAuthorizationClient({
    clientId,
    scope: "itwin-platform",
    redirectUri: process.env.ITWIN_REDIRECT_URI?.trim() || undefined,
  });

  await authClient.signIn();
  const token = await authClient.getAccessToken();
  if (!token) {
    throw new Error(
      "Bentley sign-in completed without returning an access token.",
    );
  }

  return stripBearerPrefix(token);
}

function stripBearerPrefix(token: string): string {
  return token.replace(/^Bearer\s+/i, "").trim();
}
