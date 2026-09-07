package sample.safe

import org.springframework.jdbc.core.JdbcTemplate

data class Report(val id: Long, val accountId: String, val body: String)

interface AccountAuthorization {
    fun requireRead(actorId: String, accountId: String)
}

class SafeReportController(
    private val authorization: AccountAuthorization,
    private val jdbcTemplate: JdbcTemplate,
) {
    fun reports(actorId: String, accountId: String, filter: String): List<Report> {
        authorization.requireRead(actorId, accountId)
        return jdbcTemplate.query(
            "SELECT id, account_id, body FROM reports WHERE account_id = ? AND body LIKE ?",
            { result, _ -> Report(result.getLong("id"), result.getString("account_id"), result.getString("body")) },
            accountId,
            "%$filter%",
        )
    }
}
