package sample.order

import java.time.Instant

class OrderApplicationService(
    private val repository: JpaOrderRepository,
) {
    fun approve(orderId: Long, discount: Long): Order {
        val order = repository.find(orderId)
        require(order.status == "PENDING")
        require(discount >= 0 && discount <= order.total)
        order.total -= discount
        order.status = "APPROVED"
        order.approvedAt = Instant.now()
        return repository.save(order)
    }
}

interface JpaOrderRepository {
    fun find(id: Long): Order
    fun save(order: Order): Order
}
