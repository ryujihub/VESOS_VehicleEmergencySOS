# SOS Push Notifications — setup checklist

The app code is complete. Two Firebase/EAS console steps (owner-only) are
needed for real device pushes; until they're done, registration silently
no-ops and the app still works exactly as before.

## 1. Link Firebase Cloud Messaging to the EAS project (Android)

Expo push on Android routes through FCM v1. Upload a service account key:

1. Firebase console → ⚙️ Project settings → Service accounts
2. "Generate new private key" → downloads a JSON file (keep it secret)
3. Run: `npx eas-cli credentials push`  (or upload at expo.dev →
   accounts/andreyryuji09/projects/VESOS → Credentials → Push)

## 2. Rebuild the app once after step 1

`npx eas-cli build --platform android --profile preview`
(This build already contains the notification channel + permissions; a
rebuild after the credential upload guarantees the FCM sender matches.)

## What happens at runtime

- Mechanic opens the app → OS asks notification permission → on grant, an
  Expo push token is saved to their user doc (`pushTokens[]`).
- Driver sends SOS → app queries verified mechanics and POSTs a high-priority
  message per token to `exp.host/--/api/v2/push/send`.
- Mechanic's phone alerts (max-importance "Emergency SOS alerts" channel,
  sound + vibration) **even if the app is closed**.
- If no FCM credential is uploaded, or the token list is empty, everything
  else still works: the in-app alert appears the moment they open the app.
