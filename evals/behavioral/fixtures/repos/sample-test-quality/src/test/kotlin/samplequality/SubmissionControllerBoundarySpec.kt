package samplequality

import io.kotest.core.spec.style.FunSpec
import io.kotest.matchers.shouldBe

class SubmissionControllerBoundarySpec : FunSpec({
    test("valid request returns accepted and forwards exactly the mapped request") {
        val captured = mutableListOf<SubmissionRequest>()
        val controller = SubmissionController(object : SubmissionGateway {
            override fun send(request: SubmissionRequest) {
                captured += request
            }
        })

        controller.submit(SubmissionRequest(accountId = "a-17", body = "hello")).status shouldBe 202
        captured shouldBe listOf(SubmissionRequest(accountId = "a-17", body = "hello"))
    }
})
