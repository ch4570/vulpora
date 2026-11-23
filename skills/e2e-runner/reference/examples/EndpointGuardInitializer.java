package example.e2e;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.attribute.PosixFilePermissions;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.TreeMap;

/**
 * G1 / G2 of the endpoint isolation gate (RUN-7.1b, RUN-7.1c). Plain JDK: it only collects what the application is
 * about to use and hands it to {@code check-prestart.js}, which owns the rule, so there is one implementation of
 * "does this point at something already listening that this run does not own".
 *
 * <ul>
 *   <li>{@link #checkProperties} (G1, before the Spring context starts): every property value of every property
 *       source, not just the keys the harness set. A mistyped key still carries the shared address.</li>
 *   <li>{@link #checkClients} (G2, right after the context is up, before the first scenario): the endpoint each
 *       created client object will actually use.</li>
 * </ul>
 *
 * Either call throws {@link Refused} when a value points at a port on this machine that was already listening before
 * the run and is not run-owned. Nothing has been touched yet. The pre-run listener snapshot comes from
 * {@code observe-connections.js} ({@code VULPORA_LISTENER_SNAPSHOT}); run the tests through that wrapper.
 *
 * <p>Settings (system property, then environment variable):
 * <pre>
 * vulpora.scripts.dir        / VULPORA_SCRIPTS_DIR      the e2e-runner scripts directory (required)
 * vulpora.isolation.dir      / VULPORA_ISOLATION_DIR    where findings are written (set by the wrapper)
 * vulpora.isolation.environment                         environment.json (schemaVersion 2) naming the run-owned endpoints
 * vulpora.isolation.exceptions                          reviewed isolation-exceptions.json, written by a person
 * vulpora.isolation.prestart                            enforce (default) or warn; warn is recorded and never silent
 * </pre>
 *
 * <p>Spring wiring (kept as a snippet because this example compiles with the JDK alone):
 * <pre>{@code
 * public class EndpointGuard implements ApplicationContextInitializer<ConfigurableApplicationContext> {
 *     @Override public void initialize(ConfigurableApplicationContext context) {
 *         Map<String, String> flat = new TreeMap<>();
 *         for (PropertySource<?> source : context.getEnvironment().getPropertySources()) {
 *             if (source instanceof EnumerablePropertySource<?> enumerable) {
 *                 for (String name : enumerable.getPropertyNames()) {
 *                     Object value = enumerable.getProperty(name);
 *                     if (value != null) flat.put(name, String.valueOf(value));
 *                 }
 *             }
 *         }
 *         EndpointGuardInitializer.checkProperties(flat);                       // G1
 *         context.addApplicationListener((ApplicationListener<ContextRefreshedEvent>) event -> {
 *             Map<String, String> clients = new TreeMap<>();
 *             event.getApplicationContext().getBeanProvider(LettuceConnectionFactory.class)
 *                 .ifAvailable(f -> clients.put("redis", f.getHostName() + ":" + f.getPort()));
 *             event.getApplicationContext().getBeanProvider(HikariDataSource.class)
 *                 .ifAvailable(d -> clients.put("datasource", d.getJdbcUrl()));
 *             EndpointGuardInitializer.checkClients(clients);                   // G2, before the first scenario
 *         });
 *     }
 * }
 * }</pre>
 * Register it in the test scope only (for example {@code @ContextConfiguration(initializers = EndpointGuard.class)}).
 * A client that is built later on demand is not seen by G2; the socket observer and the sandbox stage cover it.
 */
public final class EndpointGuardInitializer {
    private EndpointGuardInitializer() {}

    /** The start was refused. Message is the checker's text; nothing shared was touched. */
    public static final class Refused extends IllegalStateException {
        public Refused(String message) { super(message); }
    }

    public static void checkProperties(Map<String, String> properties) { check("prestart", properties); }

    public static void checkClients(Map<String, String> clientEndpoints) { check("client", clientEndpoints); }

    private static void check(String phase, Map<String, String> values) {
        Path scripts = Path.of(setting("vulpora.scripts.dir", "VULPORA_SCRIPTS_DIR", null));
        Path isolationDir = Path.of(setting("vulpora.isolation.dir", "VULPORA_ISOLATION_DIR", System.getProperty("java.io.tmpdir")));
        String environment = optional("vulpora.isolation.environment", "VULPORA_ISOLATION_ENVIRONMENT");
        String exceptions = optional("vulpora.isolation.exceptions", "VULPORA_ISOLATION_EXCEPTIONS");
        String mode = setting("vulpora.isolation.prestart", "VULPORA_ISOLATION_PRESTART", "enforce");
        Path properties = null;
        try {
            Files.createDirectories(isolationDir);
            // Values can carry credentials: private file, deleted right after the scan.
            properties = Files.createTempFile(isolationDir, "prestart-" + phase + "-", ".json",
                java.nio.file.attribute.PosixFilePermissions.asFileAttribute(PosixFilePermissions.fromString("rw-------")));
            Files.writeString(properties, toJson(values), StandardCharsets.UTF_8);
            List<String> command = new ArrayList<>(List.of("node", scripts.resolve("check-prestart.js").toString(),
                "--properties", properties.toString(), "--phase", phase, "--mode", mode,
                "--out", isolationDir.resolve("prestart-findings-" + phase + ".json").toString()));
            if (environment != null) { command.add("--environment"); command.add(environment); }
            if (exceptions != null) { command.add("--exceptions"); command.add(exceptions); }
            Process process = new ProcessBuilder(command).redirectErrorStream(true).start();
            String output = new String(process.getInputStream().readAllBytes(), StandardCharsets.UTF_8).trim();
            int exit = process.waitFor();
            if (exit == 3) throw new Refused(output);
            // 2 = no listener evidence, 64 = unusable input. Both fail closed: not knowing what is shared is not permission.
            if (exit != 0) throw new IllegalStateException("endpoint guard could not run (exit " + exit + "): " + output);
        } catch (IOException | InterruptedException e) {
            if (e instanceof InterruptedException) Thread.currentThread().interrupt();
            throw new IllegalStateException("endpoint guard could not run: " + e.getMessage(), e);
        } finally {
            if (properties != null) try { Files.deleteIfExists(properties); } catch (IOException ignored) { /* best effort */ }
        }
    }

    private static String optional(String property, String environmentVariable) {
        String value = System.getProperty(property, System.getenv(environmentVariable));
        return value == null || value.isBlank() ? null : value;
    }

    private static String setting(String property, String environmentVariable, String fallback) {
        String value = optional(property, environmentVariable);
        if (value == null) {
            if (fallback == null) throw new IllegalStateException("set -D" + property + " or " + environmentVariable);
            return fallback;
        }
        return value;
    }

    static String toJson(Map<String, String> values) {
        StringBuilder out = new StringBuilder("{");
        boolean first = true;
        for (Map.Entry<String, String> entry : new TreeMap<>(values).entrySet()) {
            if (!first) out.append(',');
            first = false;
            out.append(quote(entry.getKey())).append(':').append(quote(entry.getValue()));
        }
        return out.append('}').toString();
    }

    private static String quote(String text) {
        StringBuilder out = new StringBuilder("\"");
        for (char c : String.valueOf(text).toCharArray()) {
            switch (c) {
                case '"' -> out.append("\\\"");
                case '\\' -> out.append("\\\\");
                case '\n' -> out.append("\\n");
                case '\r' -> out.append("\\r");
                case '\t' -> out.append("\\t");
                default -> { if (c < 0x20) out.append(String.format("\\u%04x", (int) c)); else out.append(c); }
            }
        }
        return out.append('"').toString();
    }
}
