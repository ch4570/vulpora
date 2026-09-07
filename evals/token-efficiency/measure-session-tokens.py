#!/usr/bin/env python3
"""Count fixed session I/O fixtures; never start a model or infer billing."""
import json
from pathlib import Path
import subprocess
import sys

try:
    import tiktoken
except ImportError:
    sys.exit("Install the optional evals/token-efficiency/requirements.txt in a virtual environment.")

if tiktoken.__version__ != "0.14.0":
    sys.exit("This audit requires the pinned tiktoken 0.14.0.")

ROOT = Path(__file__).resolve().parents[2]
COLLECT = """
const {baselinePromptFor,fixtures}=require('./evals/token-efficiency/measure-session-io.js');
const {promptFor,summarizeResult}=require('./skills/start-task/scripts/session-io.js');
const {capsule,results}=fixtures();
process.stdout.write(JSON.stringify([
  {fixture:'prompt',before:baselinePromptFor(capsule),after:promptFor(capsule)},
  ...Object.entries(results).map(([fixture,result])=>({fixture,
    before:JSON.stringify(result),after:JSON.stringify(summarizeResult(result,'/workspace/attempt/result.json'))}))
]));
"""


def main():
    collected = subprocess.run(["node", "-e", COLLECT], cwd=ROOT, capture_output=True,
                               text=True, check=True, timeout=10)
    encoding = tiktoken.get_encoding("o200k_base")
    measurements = []
    for pair in json.loads(collected.stdout):
        before = len(encoding.encode(pair["before"], disallowed_special=()))
        after = len(encoding.encode(pair["after"], disallowed_special=()))
        measurements.append({"fixture": pair["fixture"], "baselineTokens": before,
                             "currentTokens": after, "savedTokens": before - after,
                             "reductionPercent": round((before - after) * 100 / before, 2)})
    print(json.dumps({"schema": "vulpora.session-io-token-measurement/v1", "modelCalls": 0,
                      "tokenizer": "tiktoken", "version": tiktoken.__version__, "encoding": "o200k_base",
                      "measurementKind": "fixed_fixture_source_tokens", "billingSavings": "unmeasured",
                      "scope": "serialized stdin and status; excludes runtime context, tools and parent verification",
                      "measurements": measurements}, indent=2))


if __name__ == "__main__":
    main()
