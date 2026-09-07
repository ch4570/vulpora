// 최소 generic 샘플 — 리뷰 대상 예시(의도적으로 검토 포인트 포함)
package sample

class OrderService(private val orderRepository: OrderRepository) {
    // 트랜잭션 경계 미표기 — 리뷰가 'transaction' 리스크를 짚어야 한다
    fun placeOrder(memberId: Long, amount: Long): Order {
        val order = Order(memberId = memberId, amount = amount)
        return orderRepository.save(order)
    }
}
