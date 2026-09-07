package samplequality

import io.kotest.core.spec.style.FunSpec
import io.kotest.matchers.shouldBe

class SelfConfirmingTotalSpec : FunSpec({
    test("invoice total agrees with its production helper") {
        val actual = InvoiceTotal.totalFor(quantity = 2, unitPrice = 15)
        val expected = InvoiceTotal.totalFor(quantity = 2, unitPrice = 15)
        actual shouldBe expected // Deliberately self-confirming expected value.
    }
})
