package sample.sales;

import jakarta.persistence.*;
import java.math.BigDecimal;
import java.time.OffsetDateTime;

/** 주문 엔티티. 마이그레이션(sales.order)과 일부 drift가 있다 — couponId는 코드에만 있다. */
@Entity
@Table(name = "order", schema = "sales")
public class Order {

    @Id
    @Column(name = "order_id")
    private Long orderId;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "member_id", nullable = false)
    private Member member;

    @Enumerated(EnumType.STRING)
    @Column(name = "status", nullable = false, length = 50)
    private OrderStatus status; // PENDING | PAID | CANCELLED

    @Column(name = "total_amount", nullable = false)
    private BigDecimal totalAmount;

    // ⚠️ drift: 마이그레이션에는 없는 컬럼(코드에만 존재) — 물리=마이그레이션 채택 대상
    @Column(name = "coupon_id")
    private Long couponId;

    @Column(name = "created_at", nullable = false)
    private OffsetDateTime createdAt;

    public enum OrderStatus { PENDING, PAID, CANCELLED }
}
