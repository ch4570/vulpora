package sample.order

import sample.persistence.JpaOrderStore
import sample.shared.SharedOrderEntity

class OrderApproval(private val store: JpaOrderStore) {
    fun approve(id: Long): SharedOrderEntity {
        val order = store.find(id)
        return store.save(order.copy(status = "APPROVED"))
    }
}
