import unittest


class SmokeTest(unittest.TestCase):
    def test_fixture_is_discoverable(self):
        self.assertTrue(True)


if __name__ == "__main__":
    unittest.main()
