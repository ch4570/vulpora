#!/usr/bin/env python3
"""Report whether the dependency-neutral PDF QA renderer prerequisites exist."""

from __future__ import annotations

import argparse
import json
import shutil
import subprocess
import sys


def version_line(command: str) -> str:
    result = subprocess.run(
        [command, "-v"],
        check=False,
        capture_output=True,
        text=True,
    )
    output = (result.stdout or result.stderr).strip().splitlines()
    return output[0] if output else "version unavailable"


def main() -> int:
    parser = argparse.ArgumentParser(description="Check Poppler tools for pdf-qa")
    parser.add_argument("--pretty", action="store_true", help="indent JSON output")
    args = parser.parse_args()

    tools = {}
    for name in ("pdfinfo", "pdftocairo", "pdftoppm"):
        executable = shutil.which(name)
        tools[name] = {
            "available": executable is not None,
            "path": executable,
            "version": version_line(executable) if executable else None,
        }

    ready = tools["pdfinfo"]["available"] and (
        tools["pdftocairo"]["available"] or tools["pdftoppm"]["available"]
    )
    result = {
        "schema_version": "pdf-qa.preflight/v1",
        "status": "pass" if ready else "revise",
        "tools": tools,
    }
    json.dump(result, sys.stdout, indent=2 if args.pretty else None, sort_keys=True)
    sys.stdout.write("\n")
    return 0 if ready else 1


if __name__ == "__main__":
    raise SystemExit(main())
