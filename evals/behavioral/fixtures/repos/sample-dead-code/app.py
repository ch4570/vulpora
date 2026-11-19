from helpers import normalize as clean
import helpers
import json
from pathlib import Path


def main():
    callbacks = [helpers.on_event]
    action = json.loads(Path(__file__).with_name('registry.json').read_text())['action']
    return clean(' Item '), callbacks[0](), getattr(helpers, action)()


if __name__ == '__main__':
    main()
