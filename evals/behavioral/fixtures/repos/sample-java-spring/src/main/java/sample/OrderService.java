package sample;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class OrderService {
    private final OrderRepository orderRepository;

    public OrderService(OrderRepository orderRepository) {
        this.orderRepository = orderRepository;
    }

    public Order placeOrder(long memberId, long amount) {
        return persist(new Order(null, memberId, amount));
    }

    @Transactional
    protected Order persist(Order order) {
        return orderRepository.save(order);
    }
}
