package example.inventory;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Isolation;
import org.springframework.transaction.annotation.Transactional;

@Service
public class StockService {
    private final ItemRepository items;

    public StockService(ItemRepository items) {
        this.items = items;
    }

    @Transactional(isolation = Isolation.READ_COMMITTED)
    public void reserve(long itemId, int quantity) {
        Item item = items.findForUpdate(itemId).orElseThrow();
        item.decrease(quantity);
    }
}
