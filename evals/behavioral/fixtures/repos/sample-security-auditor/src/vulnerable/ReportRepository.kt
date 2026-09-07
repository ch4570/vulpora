package sample.vulnerable

import org.springframework.jdbc.core.JdbcTemplate

class ReportRepository(private val jdbcTemplate: JdbcTemplate) {
    fun find(accountId: String, filter: String): List<Map<String, Any>> =
        jdbcTemplate.queryForList(
            "SELECT * FROM reports WHERE account_id = '$accountId' AND body LIKE '%$filter%'",
        )
}
