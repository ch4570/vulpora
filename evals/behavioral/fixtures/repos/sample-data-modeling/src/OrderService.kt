package sample.model

data class CustomerOrder(
    val id: Long,
    val customerId: Long,
    var status: String,
    var totalAmount: Long,
)

class OrderService {
    fun approve(order: CustomerOrder) {
        require(order.status == "PENDING")
        require(order.totalAmount >= 0)
        order.status = "APPROVED"
    }
}
