plugins { kotlin("jvm") }

dependencies {
    api(project(":order-domain"))
    implementation(project(":shared-contract"))
}
