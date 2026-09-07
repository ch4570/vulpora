package sample.order

import java.time.Instant

data class Order(
    val id: Long,
    var total: Long,
    var status: String,
    var approvedAt: Instant? = null,
)
