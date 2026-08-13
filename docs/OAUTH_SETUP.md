# Enabling OAuth sign-in in Anchor

Anchor ships without API keys (they can't be published in an open-source repo). The sign-in buttons work once you register your own app with each provider and paste the credentials into `Services/ProfileService.cs` (`OAuthUrls` dictionary — replace the `YOUR_*` placeholders).

All providers should use redirect URI `http://localhost:53682/callback` (or register your own and update the URLs).

## Google
1. https://console.cloud.google.com → create project → "APIs & Services" → OAuth consent screen (External).
2. Credentials → Create OAuth client ID → Desktop app. Copy the Client ID into `YOUR_GOOGLE_CLIENT_ID`.

## GitHub (easiest)
1. https://github.com/settings/developers → New OAuth App.
2. Authorization callback: `http://localhost:53682/callback`. Copy Client ID into `YOUR_GITHUB_CLIENT_ID`.

## Apple
1. Requires a paid Apple Developer account. https://developer.apple.com → Certificates, IDs & Profiles → Services ID with "Sign in with Apple".
2. Copy the Services ID into `YOUR_APPLE_SERVICE_ID`. Note: Apple requires an HTTPS redirect for production.

## Facebook
1. https://developers.facebook.com → Create App → add "Facebook Login".
2. Copy App ID into `YOUR_FACEBOOK_APP_ID`.

## Completing the flow

The current build only *launches* the provider's consent page. To finish sign-in you also need to:
1. Listen on `http://localhost:53682/callback` (e.g. `HttpListener`) to receive the auth code.
2. Exchange the code for tokens (each provider's token endpoint) and fetch the user's name/email.
3. Call `ProfileService.Save(...)` with the result.

## Email updates

Mail preferences are stored in the local profile. Actually sending mails (Windows update stability alerts, system health feedback, tech news, Anchor updates) requires a small backend (e.g. a serverless function + any transactional mail provider) that reads subscriber emails users opt into. Keep it opt-in and publish the backend source for the same transparency the app promises.
