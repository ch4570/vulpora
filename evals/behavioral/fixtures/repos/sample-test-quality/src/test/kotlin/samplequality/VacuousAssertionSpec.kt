package samplequality

import io.kotest.core.spec.style.FunSpec
import io.kotest.matchers.shouldBe

class VacuousAssertionSpec : FunSpec({
    test("invoice total command completes") {
        InvoiceTotal.totalFor(quantity = 2, unitPrice = 15)
        true shouldBe true // Deliberately vacuous: no observable contract is checked.
    }
})
