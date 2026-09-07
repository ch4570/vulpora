package samplequality

data class RefreshResult(val token: String)

interface TokenGateway {
    fun issue(accountId: String): String
}

class SessionRefresher(private val gateway: TokenGateway) {
    private var latestToken: String? = null

    fun refresh(accountId: String): RefreshResult {
        latestToken = gateway.issue(accountId)
        return RefreshResult(requireNotNull(latestToken))
    }
}
