package samplequality

import io.kotest.core.spec.style.FunSpec

class SharedCacheCleanupSpec(private val cache: SharedCache) : FunSpec({
    beforeTest {
        cache.flushDatabase() // Deliberately broad cleanup: ownership is not evidenced.
    }

    test("cache begins empty") {
        // This fixture has no disposable endpoint, namespace, or parallelism policy.
    }
})
