package sample.vulnerable

import org.springframework.web.reactive.function.client.WebClient

class CallbackNotifier {
    fun notify(callbackUrl: String, accountId: String) {
        WebClient.create(callbackUrl)
            .post()
            .bodyValue(mapOf("accountId" to accountId))
            .retrieve()
            .toBodilessEntity()
            .block()
    }
}
