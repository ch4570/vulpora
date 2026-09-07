package samplequality

object InvoiceTotal {
    fun totalFor(quantity: Int, unitPrice: Int): Int {
        require(quantity > 0) { "quantity must be positive" }
        return quantity * unitPrice
    }
}
