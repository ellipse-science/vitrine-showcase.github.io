plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

android {
    namespace = "science.ellipse.vitrine"

    // ⚠️ 36 (Android 16) est un PLANCHER, pas un choix de confort : depuis le
    // 31 août 2026, Google Play refuse toute nouvelle application qui vise
    // moins. Le test `tests/applications.test.ts` interdit de redescendre.
    compileSdk = 36

    defaultConfig {
        applicationId = "science.ellipse.vitrine"
        minSdk = 26
        targetSdk = 36
        versionCode = 1
        versionName = "1.0.0"
    }

    buildTypes {
        release {
            // Pas d'obfuscation : l'application ne contient aucune logique à
            // protéger, et R8 compliquerait la lecture d'un rapport de plantage
            // sans rien apporter à une coquille de 400 lignes.
            isMinifyEnabled = false
            proguardFiles(getDefaultProguardFile("proguard-android-optimize.txt"), "proguard-rules.pro")
        }
    }

    // La signature de publication vient de l'intégration continue, jamais du
    // dépôt : voir android/PUBLIER.md. Aucun trousseau n'est versionné ici.
    if (System.getenv("VITRINE_KEYSTORE") != null) {
        signingConfigs {
            create("publication") {
                storeFile = file(System.getenv("VITRINE_KEYSTORE"))
                storePassword = System.getenv("VITRINE_KEYSTORE_PASSWORD")
                keyAlias = System.getenv("VITRINE_KEY_ALIAS")
                keyPassword = System.getenv("VITRINE_KEY_PASSWORD")
            }
        }
        buildTypes.getByName("release").signingConfig = signingConfigs.getByName("publication")
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    kotlinOptions {
        jvmTarget = "17"
    }

    buildFeatures {
        viewBinding = true
    }
}

dependencies {
    implementation("androidx.core:core-ktx:1.15.0")
    implementation("androidx.appcompat:appcompat:1.7.0")
    implementation("com.google.android.material:material:1.12.0")
    implementation("androidx.constraintlayout:constraintlayout:2.2.0")
    // Onglets Chrome : l'équivalent Android de SFSafariViewController, pour
    // les liens sortants du site.
    implementation("androidx.browser:browser:1.8.0")
    implementation("androidx.swiperefreshlayout:swiperefreshlayout:1.1.0")
    implementation("androidx.activity:activity-ktx:1.9.3")
    implementation("org.jetbrains.kotlinx:kotlinx-coroutines-android:1.9.0")

    testImplementation("junit:junit:4.13.2")
    testImplementation("org.jetbrains.kotlinx:kotlinx-coroutines-test:1.9.0")
    // `org.json` n'est qu'un talon inerte dans android.jar : sans une vraie
    // implémentation, les tests d'analyse JSON passeraient sans rien vérifier.
    testImplementation("org.json:json:20240303")
}
