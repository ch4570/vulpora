package example.e2e;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;

import java.io.IOException;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Minimal repository harness core for a Vulpora E2E run plan.
 *
 * <p>It only executes what {@code export-catalog-plan.js} planned and records raw observations.
 * It never decides PASS/FAIL, masks, or writes the run result: {@code assemble-run-result.js}
 * does that, so a harness bug cannot silently skip a comparison. Call {@link #run} from a
 * JUnit/Testcontainers test after the containers and application are up, stop them yourself,
 * then call {@link #writeObservations} with the lifecycle evidence.
 *
 * <p>Captures: token {@code X} is read from the response header {@code X}, otherwise from the
 * top-level JSON field whose camelCase name matches it ({@code PLAN-DIGEST} → {@code planDigest}).
 */
public final class CatalogPlanRunner {
    private static final Pattern PLACEHOLDER = Pattern.compile("\\{\\{([a-z]+(?:\\.[A-Z][A-Z0-9_-]*)?)}}");

    private final ObjectMapper json = new ObjectMapper();
    private final HttpClient http = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(5)).build();
    private final ObjectNode results = json.createObjectNode();
    private final Map<String, Map<String, String>> captures = new HashMap<>();
    private final Path outDir;
    private final String runId;
    private final Instant startedAt = Instant.now();
    private boolean cleanupFailed;

    public CatalogPlanRunner(Path outDir, String runId) {
        this.outDir = outDir;
        this.runId = runId;
    }

    /** Executes every selected scenario in plan order, then the teardowns the plan schedules after it. */
    public void run(Path planFile, String apiBaseUrl, Map<String, String> seeds) throws IOException, InterruptedException {
        JsonNode plan = json.readTree(planFile.toFile());
        Files.createDirectories(outDir.resolve("bodies"));
        Map<String, JsonNode> byId = new HashMap<>();
        plan.get("scenarios").forEach(scenario -> byId.put(scenario.get("id").asText(), scenario));
        for (JsonNode scenario : plan.get("scenarios")) {
            if (!scenario.get("selected").asBoolean()) continue;
            String id = scenario.get("id").asText();
            ObjectNode observation = results.putObject(id);
            Map<String, String> vars = variables(scenario, byId, apiBaseUrl, seeds);
            if (!"http".equals(scenario.at("/request/type").asText())) {
                observation.put("executed", false).put("skippedReason", "example harness executes http scenarios only");
            } else if (failedParent(scenario)) {
                observation.put("executed", false).put("skippedReason", "parent not executed");
            } else {
                execute(id, scenario, vars, observation);
            }
            for (JsonNode owner : scenario.get("runTeardownsAfter")) {
                teardown(byId.get(owner.asText()), variables(byId.get(owner.asText()), byId, apiBaseUrl, seeds));
            }
        }
    }

    private boolean failedParent(JsonNode scenario) {
        for (JsonNode parent : scenario.get("dependsOn")) {
            JsonNode observed = results.get(parent.asText());
            if (observed == null || !observed.path("executed").asBoolean()) return true;
        }
        return false;
    }

    private Map<String, String> variables(JsonNode scenario, Map<String, JsonNode> byId, String api, Map<String, String> seeds) {
        Map<String, String> vars = new HashMap<>();
        vars.put("api", api);
        seeds.forEach((key, value) -> vars.put("seed." + key, value));
        List<String> lineage = new ArrayList<>();
        collectAncestors(scenario, byId, lineage);
        lineage.add(scenario.get("id").asText()); // own captures, for its teardown
        for (String ancestor : lineage) {
            captures.getOrDefault(ancestor, Map.of()).forEach((key, value) -> vars.put("prev." + key, value));
        }
        return vars;
    }

    private void collectAncestors(JsonNode scenario, Map<String, JsonNode> byId, List<String> into) {
        for (JsonNode parent : scenario.get("dependsOn")) {
            collectAncestors(byId.get(parent.asText()), byId, into);
            if (!into.contains(parent.asText())) into.add(parent.asText());
        }
    }

    private static String substitute(String text, Map<String, String> vars) {
        Matcher matcher = PLACEHOLDER.matcher(text);
        StringBuilder out = new StringBuilder();
        while (matcher.find()) {
            String value = vars.get(matcher.group(1));
            if (value == null) throw new IllegalStateException("missing-capture: " + matcher.group(1));
            matcher.appendReplacement(out, Matcher.quoteReplacement(value));
        }
        return matcher.appendTail(out).toString();
    }

    private void execute(String id, JsonNode scenario, Map<String, String> vars, ObjectNode observation)
            throws IOException, InterruptedException {
        String text;
        try {
            text = substitute(scenario.at("/request/text").asText(), vars);
        } catch (IllegalStateException missing) {
            observation.put("executed", false).put("skippedReason", missing.getMessage());
            return;
        }
        String[] parts = text.split("\n\n", 2);
        String[] lines = parts[0].split("\n");
        String[] requestLine = lines[0].trim().split("\\s+");
        String body = parts.length > 1 ? parts[1].trim() : "";
        HttpRequest.Builder request = HttpRequest.newBuilder(URI.create(requestLine[1])).timeout(Duration.ofSeconds(30))
                .method(requestLine[0], body.isEmpty() ? HttpRequest.BodyPublishers.noBody() : HttpRequest.BodyPublishers.ofString(body));
        for (int index = 1; index < lines.length; index++) {
            int colon = lines[index].indexOf(':');
            if (colon > 0) request.header(lines[index].substring(0, colon).trim(), lines[index].substring(colon + 1).trim());
        }
        long started = System.nanoTime();
        HttpResponse<String> response = http.send(request.build(), HttpResponse.BodyHandlers.ofString());
        Path bodyFile = outDir.resolve("bodies").resolve(id + ".txt");
        Files.writeString(bodyFile, response.body());
        observation.put("executed", true)
                .put("httpStatus", response.statusCode())
                .put("latencyMs", (System.nanoTime() - started) / 1_000_000)
                .put("bodyFile", outDir.relativize(bodyFile).toString());
        ObjectNode used = observation.putObject("vars");
        vars.forEach((key, value) -> { if (key.startsWith("prev.") || key.startsWith("seed.")) used.put(key, value); });
        Map<String, String> captured = new HashMap<>();
        JsonNode parsed = parse(response.body());
        for (JsonNode token : scenario.get("captures")) {
            String name = token.asText();
            String value = response.headers().firstValue(name)
                    .orElseGet(() -> parsed.path(camel(name)).isValueNode() ? parsed.path(camel(name)).asText() : null);
            if (value != null) captured.put(name, value);
        }
        captures.put(id, captured);
    }

    private JsonNode parse(String body) {
        try {
            return json.readTree(body);
        } catch (IOException notJson) {
            return json.createObjectNode();
        }
    }

    private static String camel(String token) {
        String[] words = token.toLowerCase().split("[-_]");
        StringBuilder out = new StringBuilder(words[0]);
        for (int index = 1; index < words.length; index++) {
            if (!words[index].isEmpty()) out.append(Character.toUpperCase(words[index].charAt(0))).append(words[index].substring(1));
        }
        return out.toString();
    }

    private void teardown(JsonNode owner, Map<String, String> vars) throws IOException, InterruptedException {
        ObjectNode observation = (ObjectNode) results.get(owner.get("id").asText());
        String status = "PASS";
        String detail = "";
        for (JsonNode line : owner.get("teardown")) {
            // Commands were allowlisted by validate-catalog.js: one command per line, no shell control.
            List<String> argv = tokenize(substitute(line.asText(), vars));
            Process process = new ProcessBuilder(argv).redirectErrorStream(true).start();
            String output = new String(process.getInputStream().readAllBytes());
            if (process.waitFor() != 0) {
                status = "FAIL";
                detail = argv.get(0) + ": " + output.strip();
            }
        }
        if ("FAIL".equals(status)) cleanupFailed = true;
        observation.putObject("teardown").put("status", status).put("detail", detail);
    }

    private static List<String> tokenize(String command) {
        List<String> argv = new ArrayList<>();
        Matcher matcher = Pattern.compile("'([^']*)'|\"([^\"]*)\"|(\\S+)").matcher(command);
        while (matcher.find()) argv.add(matcher.group(1) != null ? matcher.group(1) : matcher.group(2) != null ? matcher.group(2) : matcher.group(3));
        return argv;
    }

    /**
     * Writes observations for {@code assemble-run-result.js}. {@code environment} holds runtime proof
     * (images, mapped endpoints); {@code teardownStatus} is PASS only after the harness stopped its own
     * containers; {@code absenceProbes} lists probes proving case data is gone.
     */
    public Path writeObservations(ObjectNode environment, String teardownStatus, ArrayNode absenceProbes) throws IOException {
        ObjectNode root = json.createObjectNode();
        root.put("schema", "vulpora.e2e-harness-observations/v1").put("runId", runId)
                .put("startedAt", startedAt.toString()).put("finishedAt", Instant.now().toString());
        root.set("environment", environment);
        root.set("results", results);
        ObjectNode lifecycle = root.putObject("lifecycle");
        lifecycle.putObject("cleanup").put("status", cleanupFailed ? "FAIL" : "PASS");
        lifecycle.putObject("teardown").put("status", teardownStatus);
        lifecycle.putObject("orphanAudit").put("status", "NOT_RUN"); // filled by audit-orphans.js via --orphan-audit
        lifecycle.set("absenceProbes", absenceProbes);
        Path file = outDir.resolve("observations.json");
        json.writerWithDefaultPrettyPrinter().writeValue(file.toFile(), root);
        return file;
    }
}
