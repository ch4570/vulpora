#!/bin/bash
# Compatibility tombstone. Native Vulpora agents are unavailable until an
# OS-backed launcher can bind an authenticated release to an isolated runtime.

PATH='/usr/bin:/bin:/usr/sbin:/sbin'
export PATH

set -u
set -f

printf '%s\n' 'AGENT_RUNTIME_ERROR:project_execution_disabled' >&2
exit 69
