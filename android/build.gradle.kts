// Top-level build file. The app module is the only module and uses no external libraries,
// so Gradle only needs the Android Gradle Plugin itself.
// 9.5.1 diperlukan karena SDK di mesin build memakai platform "android-37.0"
// (penamaan API 37) yang belum dikenal AGP 8.x.
plugins {
    id("com.android.application") version "9.5.1" apply false
}
