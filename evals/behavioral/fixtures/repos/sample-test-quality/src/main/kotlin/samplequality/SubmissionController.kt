package samplequality

data class SubmissionRequest(val accountId: String, val body: String)
data class HttpResponse(val status: Int)

interface SubmissionGateway {
    fun send(request: SubmissionRequest)
}

class SubmissionController(private val gateway: SubmissionGateway) {
    fun submit(request: SubmissionRequest): HttpResponse {
        gateway.send(request)
        return HttpResponse(status = 202)
    }
}
