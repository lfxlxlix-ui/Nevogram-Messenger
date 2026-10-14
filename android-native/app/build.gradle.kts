plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

android {
    namespace = "com.nevogram.messenger"
    compileSdk = 35

    defaultConfig {
        applicationId = "com.nevogram.messenger"
        minSdk = 24
        targetSdk = 35
        versionCode = 1
        versionName = "0.1.0"
    }
}
