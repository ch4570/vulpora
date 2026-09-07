package samplequality

import io.kotest.core.spec.style.FunSpec
import io.mockk.every
import io.mockk.just
import io.mockk.mockk
import io.mockk.runs
import io.mockk.verifySequence

class DispatchCoordinatorBrittleSpec : FunSpec({
    test("dispatch uses the current private call topology") {
        val journal = mockk<DispatchJournal>(relaxed = true)
        every { journal.record(any()) } just runs

        DispatchCoordinator(journal).dispatch("a-17")

        verifySequence {
            journal.record("dispatch-start:a-17")
            journal.record("dispatch-complete:a-17")
        }
        // Deliberately brittle: relaxed mock, wildcard stubbing, and exact internal order.
    }
})
