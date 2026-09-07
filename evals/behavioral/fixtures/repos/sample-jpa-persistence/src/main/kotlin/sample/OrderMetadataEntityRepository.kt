package sample

import org.springframework.data.jpa.repository.JpaRepository

interface OrderMetadataEntityRepository : JpaRepository<OrderMetadataEntity, Long>
