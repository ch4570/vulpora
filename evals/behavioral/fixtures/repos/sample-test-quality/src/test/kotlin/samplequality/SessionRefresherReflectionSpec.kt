package samplequality

import io.kotest.core.spec.style.FunSpec
import io.kotest.matchers.shouldBe

class SessionRefresherReflectionSpec : FunSpec({
    test("stores the last token in its private field") {
        val refresher = SessionRefresher(object : TokenGateway {
            override fun issue(accountId: String) = "token-for-$accountId"
        })
        refresher.refresh("a-17")

        val field = SessionRefresher::class.java.getDeclaredField("latestToken")
        field.isAccessible = true
        field.get(refresher) shouldBe "token-for-a-17"
    }
})
