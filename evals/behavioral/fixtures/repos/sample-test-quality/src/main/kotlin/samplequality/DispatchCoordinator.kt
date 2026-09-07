package samplequality

interface DispatchJournal {
    fun record(event: String)
}

class DispatchCoordinator(private val journal: DispatchJournal) {
    fun dispatch(accountId: String) {
        journal.record("dispatch-start:$accountId")
        journal.record("dispatch-complete:$accountId")
    }
}
