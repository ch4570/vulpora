package sample.customer

data class LegacyCustomerPayload(
    val custNo: String,
    val gradeCode: String,
    val deletedYn: String,
)

interface LegacyCustomerClient {
    fun fetch(customerNumber: String): LegacyCustomerPayload
}

class CustomerQueryService(private val legacyClient: LegacyCustomerClient) {
    fun customer(customerNumber: String): LegacyCustomerPayload =
        legacyClient.fetch(customerNumber)
}
