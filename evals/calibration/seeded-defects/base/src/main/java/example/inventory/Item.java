package example.inventory;

import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Version;

@Entity
public class Item {
    @Id
    private Long id;
    private int stock;
    @Version
    private long version;

    public int getStock() { return stock; }

    public void decrease(int quantity) {
        if (stock < quantity) {
            throw new IllegalStateException("insufficient stock");
        }
        stock -= quantity;
    }
}
