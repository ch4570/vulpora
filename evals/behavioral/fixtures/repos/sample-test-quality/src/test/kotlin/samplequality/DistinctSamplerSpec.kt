package samplequality

import io.kotest.core.spec.style.FunSpec
import io.kotest.matchers.collections.shouldHaveSize
import io.kotest.matchers.shouldBe

class DistinctSamplerSpec : FunSpec({
    test("all-zero fallback returns supplied values") {
        val values = listOf("red", "blue", "green")
        val result = DistinctSampler().pick(values, count = 2)
        result shouldHaveSize 2
        result.all { it in values } shouldBe true
        // Deliberately missing: result.distinct().size shouldBe result.size.
        // A duplicate mutant returning ["red", "red"] passes these weak assertions.
    }
})
