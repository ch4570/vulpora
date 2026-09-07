plugins {
    java
}

tasks.register<JavaExec>("fixtureContracts") {
    group = "verification"
    description = "Runs the dependency-free JVM contract probe for this behavioral fixture."
    classpath = sourceSets.main.get().runtimeClasspath
    mainClass.set("samplequality.FixtureContractRunner")
}
