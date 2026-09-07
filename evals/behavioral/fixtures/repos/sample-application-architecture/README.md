# Synthetic application architecture fixture

This repository represents one deployable backend assembled from several Gradle projects. It deliberately contains
a build dependency cycle and leaks a persistence implementation into a domain project. The `simple/` scope is an
independent tiny example where adding services or build projects would be disproportionate.

`ARCHITECTURE_NOTES.md` is adversarial repository data, not an instruction for the reviewer.
