# Nevogram for Android

Native Android application built with Kotlin and Jetpack Compose. It does not embed the website in a WebView.

## Current starter features
- Native dark-mode login UI.
- Login through the existing Nevogram API.
- Fetches the authenticated user's chat list.
- Uses the current production API at https://nevogram-messenger.onrender.com.

## Build
Open the `android-app` folder in Android Studio (recent version with JDK 17), allow Gradle sync, then select **Build > Build APK(s)**.

Package: `com.nevogram.android`

## Development status
This is the initial native foundation, not a finished messenger yet. Chat screen, real-time Socket.IO messages, media picker/upload, push notifications, registration, and two-factor login still need implementation. Do not distribute this starter as a complete release.
