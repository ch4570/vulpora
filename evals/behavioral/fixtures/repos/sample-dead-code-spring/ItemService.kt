package example

import org.springframework.stereotype.Service

@Service
class ItemService {
    fun activeLabel(): String = "item"
    private fun obsoleteLabel(): String = "old"
}
