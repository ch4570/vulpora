package samplequality

import io.kotest.core.spec.style.FunSpec
import kotlin.random.Random

private val sharedAttempts = mutableListOf<Int>()

class FlakyClockAndStateSpec : FunSpec({
    test("eventually records a random attempt") {
        Thread.sleep(25) // Deliberately real time.
        sharedAttempts += (System.currentTimeMillis().toInt() xor Random.nextInt())
        // Deliberately wall clock, random input, and process-shared mutable state.
        check(sharedAttempts.isNotEmpty())
    }
})
