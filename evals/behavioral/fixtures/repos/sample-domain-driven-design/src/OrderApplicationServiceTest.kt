package sample.order

class OrderApplicationServiceTest {
    fun `approval returns an approved order with the discounted total`() {
        val repository = RecordingOrderRepository(Order(1, 1_000, "PENDING"))
        val result = OrderApplicationService(repository).approve(1, 100)

        check(result.status == "APPROVED")
        check(result.total == 900L)
        check(result.approvedAt != null)
    }

    fun `approval calls persistence collaborators in this exact order`() {
        val repository = RecordingOrderRepository(Order(1, 1_000, "PENDING"))
        OrderApplicationService(repository).approve(1, 100)

        check(repository.calls == listOf("find:1", "save:1"))
    }
}

private class RecordingOrderRepository(private val order: Order) : JpaOrderRepository {
    val calls = mutableListOf<String>()

    override fun find(id: Long): Order {
        calls += "find:$id"
        return order
    }

    override fun save(order: Order): Order {
        calls += "save:${order.id}"
        return order
    }
}
