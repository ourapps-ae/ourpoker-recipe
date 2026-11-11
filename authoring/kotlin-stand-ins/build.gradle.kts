// Type-checks the Kotlin stand-ins (implementation/stand-ins/android) on the JVM, without the Android SDK: the Android and
// Compose types they name are signature-only stubs (src/main/kotlin/stubs), and Usage.kt makes every call the application
// makes through Video.kt, Updates.kt, ui/Lessons.kt and ui/SeatScreen.kt. Run: gradle -p authoring/kotlin-stand-ins compileKotlin
import org.jetbrains.kotlin.gradle.dsl.JvmTarget

plugins { kotlin("jvm") version "2.3.20" }
repositories { mavenCentral() }
dependencies { implementation("org.jetbrains.kotlinx:kotlinx-coroutines-core:1.10.2") }
java { sourceCompatibility = JavaVersion.VERSION_17; targetCompatibility = JavaVersion.VERSION_17 }
kotlin {
    compilerOptions { jvmTarget.set(JvmTarget.JVM_17) }
    sourceSets.main { kotlin.srcDir("../../implementation/stand-ins/android/app/src/main/java") }
}
