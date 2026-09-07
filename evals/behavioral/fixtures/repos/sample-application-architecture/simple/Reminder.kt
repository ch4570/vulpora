package sample.reminder

data class Reminder(val id: Long, val message: String)

class ReminderService(private val reminders: MutableMap<Long, Reminder>) {
    fun put(reminder: Reminder): Reminder = reminder.also { reminders[it.id] = it }
    fun get(id: Long): Reminder? = reminders[id]
}
