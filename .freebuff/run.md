# VESOS / AyudaAuto — run doc

Expo (SDK 57) React Native app: driver SOS + mechanic dashboard, Firebase (Auth/Firestore/Storage), react-native-web for browser preview.

## Reproduce artifacts (fresh checkout)

1. `npm install` — npm project (package-lock.json committed). node_modules is already present in this checkout.
2. No env files to copy: the Firebase web config is committed in `firebaseConfig.js` (public web API key), and the Google Maps key lives in `app.json` (`expo.android.config.googleMaps.apiKey`).
3. No native build needed for the web preview. (Device builds: `npm run android` / `npm run ios`.)

## Run the server (web preview)

- Script: `npm run web` → `expo start --web`, Metro dev server on **http://localhost:8081** (Expo default port; it was free at setup).
- Detached start on Windows (stdout and stderr must go to different files).
  NOTE: `expo start --no-open` is NOT supported by the SDK 57 CLI (`unknown or unexpected option`);
  use the `BROWSER=none` env var instead to keep it from opening a browser:

  ```powershell
  powershell -NoProfile -Command "$env:BROWSER='none'; (Start-Process -FilePath 'npm.cmd' -ArgumentList 'run','web' -RedirectStandardOutput '<server-log>' -RedirectStandardError '<server-log>.err' -WindowStyle Hidden -PassThru).Id"
  ```

- Confirm the pid survived: `powershell -NoProfile -Command "Get-Process -Id <pid>"`.
- Wait for the URL to answer before registering — the first web compile is slow (can take minutes):
  `curl -s -o /dev/null -w "%{http_code}" http://localhost:8081` until it returns 200.
- Register preview: URL `http://localhost:8081`, pid = printed pid.
- Stop the server: `powershell -NoProfile -Command "Get-Process -Id <pid> | Stop-Process"`.
