package samplequality

// This is an intentionally unsupported in-house test DSL. It is reviewable, but
// v1 automatic refactoring supports only recognized Kotlin/JUnit/Kotest profiles.
@UnsupportedVerificationDsl
class UnsupportedProfileSpec {
    fun total_is_consistent() = verifyCase { InvoiceTotal.totalFor(2, 15) }
}
