# Sahaaya mobile applications

Sahaaya includes native Android and iOS projects powered by Capacitor. The native applications connect to the same secure Sahaaya service and database as the website, so accounts, requests, offers, locations, delivery codes, notifications, and administrator actions stay consistent across devices.

## Application identity

- App name: `Sahaaya`
- Android application ID / iOS bundle ID: `com.hiadityarawat.sahaaya`
- Production service: `https://sahaaya-disaster-response.hi-aditya-rawat.chatgpt.site`

## Included native behavior

- Android and iOS installable projects
- Branded app icons and native splash screen
- Native status-bar styling and safe-area handling
- Android hardware-back-button support
- Native network-state monitoring
- External websites open safely outside Sahaaya
- Camera/photo-picker and location permission descriptions
- Startup animation replay when the native app resumes
- Offline recovery screen when the service cannot be reached

## Development

Install dependencies and synchronize the native projects:

```bash
npm install
npm run mobile:sync
```

Open the Android project with Android Studio:

```bash
npm run mobile:android
```

Open the iOS project on macOS with Xcode:

```bash
npm run mobile:ios
```

## Release requirements

Android release builds require Android Studio, an Android SDK, a private signing key, and a Google Play Console account. iOS release builds require macOS, Xcode, an Apple Developer account, signing certificates, and App Store Connect access. Never commit signing keys, certificates, or store credentials.

Before a store release, replace the temporary Sites hostname with a permanent production domain, complete privacy-policy and store-listing information, perform physical-device testing, and create signed release builds.
