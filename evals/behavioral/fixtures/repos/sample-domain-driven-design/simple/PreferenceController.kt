package sample.preference

data class Preference(val userId: Long, val locale: String)

class PreferenceController(private val store: PreferenceStore) {
    fun get(userId: Long): Preference? = store.find(userId)
    fun put(preference: Preference): Preference = store.save(preference)
}

interface PreferenceStore {
    fun find(userId: Long): Preference?
    fun save(preference: Preference): Preference
}
