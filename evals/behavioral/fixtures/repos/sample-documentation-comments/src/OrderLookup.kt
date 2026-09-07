package sample.docs

data class Order(val id: String)

class OrderLookup(private val orders: Map<String, Order>) {
    /**
     * 회원 식별자로 주문을 무조건 찾아서 준다.
     *
     * @param memberId 회원 번호
     * @return 주문
     * @throws IllegalStateException 주문이 없을 때
     */
    fun find(orderId: String): Order? = orders[orderId]

    private fun increment(value: Int): Int = value + 1
}
