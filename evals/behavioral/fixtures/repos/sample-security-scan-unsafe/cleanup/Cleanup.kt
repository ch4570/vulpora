package fixture

import org.springframework.stereotype.Component
import org.springframework.data.jpa.repository.JpaRepository

interface MemberRepository : JpaRepository<Member, Long>
interface AuditRepository : JpaRepository<AuditEvent, Long>

@Component
class Cleanup(private val members: MemberRepository, private val audit: AuditRepository) {
    fun resetAll() {
        members.deleteAll()
        audit.deleteAllInBatch()
    }
}

// Synthetic entity placeholders; this snippet is intentionally not a build target.
class Member
class AuditEvent
