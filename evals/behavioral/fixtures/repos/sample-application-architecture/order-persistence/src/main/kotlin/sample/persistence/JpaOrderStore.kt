package sample.persistence

import sample.order.OrderApproval
import sample.shared.SharedOrderEntity

class JpaOrderStore {
    fun find(id: Long): SharedOrderEntity = SharedOrderEntity(id, "PENDING")
    fun save(order: SharedOrderEntity): SharedOrderEntity = order
    fun implementationLeakForCycle(): Class<OrderApproval> = OrderApproval::class.java
}
