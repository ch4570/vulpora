def normalize(value):
    return value.strip().lower()


def on_event():
    return 'handled'


def registered_action():
    return 'registered'


def _unused_format(value):
    return '[{}]'.format(value)


def _orphan_a(n):
    return _orphan_b(n - 1) if n > 0 else 0


def _orphan_b(n):
    return _orphan_a(n - 1) if n > 0 else 0


def _test_only(value):
    return value + 1


def _called_same_line(): return 1
SAME_LINE_RESULT = _called_same_line()
