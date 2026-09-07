package sample

import jakarta.persistence.Entity
import jakarta.persistence.Id

@Entity
class OrderMetadataEntity(
    @Id val id: Long,
    val metadata: Map<String, String>?,
    val options: List<String>?,
    val tags: List<String>?,
)
