package sample.vulnerable

import org.springframework.security.core.annotation.AuthenticationPrincipal
import org.springframework.security.core.userdetails.UserDetails
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.PathVariable
import org.springframework.web.bind.annotation.RequestHeader
import org.springframework.web.bind.annotation.RequestParam
import org.springframework.web.bind.annotation.RestController

@RestController
class ReportController(
    private val reportRepository: ReportRepository,
    private val callbackNotifier: CallbackNotifier,
) {
    @GetMapping("/accounts/{accountId}/reports")
    fun reports(
        @AuthenticationPrincipal principal: UserDetails,
        @PathVariable accountId: String,
        @RequestParam filter: String,
        @RequestParam callbackUrl: String,
        @RequestHeader("Authorization") authorization: String,
    ): List<Map<String, Any>> {
        AuditLog.info("report actor=${principal.username} authorization=$authorization")
        val rows = reportRepository.find(accountId, filter)
        callbackNotifier.notify(callbackUrl, accountId)
        return rows
    }
}
