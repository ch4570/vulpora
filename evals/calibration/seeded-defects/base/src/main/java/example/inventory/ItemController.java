package example.inventory;

import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RestController;

@RestController
public class ItemController {
    private final ItemRepository items;

    public ItemController(ItemRepository items) {
        this.items = items;
    }

    @PreAuthorize("hasRole('ADMIN')")
    @DeleteMapping("/items/{id}")
    public void remove(@PathVariable long id) {
        items.deleteById(id);
    }
}
