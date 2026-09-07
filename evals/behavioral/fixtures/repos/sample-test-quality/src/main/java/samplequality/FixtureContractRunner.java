package samplequality;

import java.util.Arrays;
import java.util.List;
import java.util.stream.Collectors;

/**
 * Dependency-free JVM probe for fixture contracts. It intentionally does not
 * compile the Kotlin/Kotest review targets; adapters must report its scope
 * honestly as fixture-contract evidence.
 */
public final class FixtureContractRunner {
    private FixtureContractRunner() {}

    public static void main(String[] args) {
        int executed = 0;

        require(totalFor(2, 15) == 30, "positive invoice total");
        executed++;
        try {
            totalFor(0, 15);
            throw new AssertionError("zero quantity must be rejected");
        } catch (IllegalArgumentException expected) {
            executed++;
        }

        List<String> sample = distinctPick(Arrays.asList("red", "blue", "green"), 2);
        require(sample.equals(Arrays.asList("red", "blue")), "deterministic distinct sample");
        require(sample.stream().distinct().count() == sample.size(), "sample must not repeat values");
        executed += 2;

        List<String> input = Arrays.asList("red", "blue", "green");
        List<String> duplicateMutant = Arrays.asList("red", "red");
        require(weakSamplerOracle(input, duplicateMutant), "weak membership oracle should let duplicate mutant survive");
        executed++;
        require(!strongSamplerOracle(input, duplicateMutant), "strong distinctness oracle must kill duplicate mutant");
        executed++;

        System.out.println("fixture_contract_harness: PASS");
        System.out.println("executed=" + executed);
        System.out.println("duplicate_mutant_survives_weak_oracle=true");
        System.out.println("duplicate_mutant_killed_by_strong_oracle=true");
        System.out.println("scope=dependency-free JVM contract probe; Kotlin/Kotest tests not executed");
    }

    private static int totalFor(int quantity, int unitPrice) {
        if (quantity <= 0) throw new IllegalArgumentException("quantity must be positive");
        return quantity * unitPrice;
    }

    private static List<String> distinctPick(List<String> values, int count) {
        return values.stream().distinct().limit(count).collect(Collectors.toList());
    }

    private static boolean weakSamplerOracle(List<String> input, List<String> result) {
        return result.size() == 2 && input.containsAll(result);
    }

    private static boolean strongSamplerOracle(List<String> input, List<String> result) {
        return weakSamplerOracle(input, result) && result.stream().distinct().count() == result.size();
    }

    private static void require(boolean condition, String message) {
        if (!condition) throw new AssertionError(message);
    }
}
