plugins {
    id("com.android.application")
}

// Alamat server dibaca dari gradle.properties (AROMA_BASE_URL) supaya bisa
// diganti tanpa menyentuh kode:  AROMA_BASE_URL=https://aroma.contoh.com
val aromaBaseUrl: String = (project.findProperty("AROMA_BASE_URL") as String?)?.trim()
    ?: "http://192.168.1.117:4000"

android {
    namespace = "id.aromajiwa.hadir"
    // Mengikuti SDK yang terpasang di mesin build (platform android-37.0 + build-tools 36.0.0).
    // targetSdk sengaja tetap 34 agar perilaku WebView (status bar, edge-to-edge) tidak berubah.
    compileSdk = 37
    buildToolsVersion = "36.0.0"

    defaultConfig {
        applicationId = "id.aromajiwa.hadir"
        minSdk = 24
        targetSdk = 34
        versionCode = 1
        versionName = "1.0.0"
        buildConfigField("String", "BASE_URL", "\"$aromaBaseUrl\"")
    }

    buildFeatures {
        buildConfig = true
    }

    buildTypes {
        debug {
            applicationIdSuffix = ".debug"
            versionNameSuffix = "-debug"
        }
        release {
            isMinifyEnabled = false
            isShrinkResources = false
            // Ditandatangani dengan debug keystore agar APK langsung bisa dipasang.
            // Untuk Play Store, ganti dengan signingConfig rilis Anda sendiri.
            signingConfig = signingConfigs.getByName("debug")
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    packaging {
        resources.excludes += setOf("META-INF/*.kotlin_module")
    }
}
