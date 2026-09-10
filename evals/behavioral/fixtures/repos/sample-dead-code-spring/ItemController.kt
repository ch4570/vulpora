package example

import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.RestController

@RestController
class ItemController(private val service: ItemService) {
    @GetMapping("/items")
    fun listItems(): String = service.activeLabel()
}
