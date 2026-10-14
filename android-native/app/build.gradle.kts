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
        versionName = "0.2.0"
    }
}

dependencies {
    implementation("io.socket:socket.io-client:2.1.1") {
        exclude(group = "org.json", module = "json")
    }
}
