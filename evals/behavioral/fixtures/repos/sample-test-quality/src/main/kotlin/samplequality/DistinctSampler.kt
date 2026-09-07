package samplequality

class DistinctSampler {
    fun pick(values: List<String>, count: Int): List<String> {
        require(count in 1..values.distinct().size)
        return values.distinct().take(count)
    }
}
