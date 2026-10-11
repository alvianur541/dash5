import importlib.util
import json
from pathlib import Path
import unittest


class ScannerTests(unittest.TestCase):
    def scan(self, text):
        path = Path(__file__).with_name('security_audit.py')
        self.assertTrue(path.exists(), 'value-free scanner is missing')
        spec = importlib.util.spec_from_file_location('security_audit', path)
        assert spec is not None and spec.loader is not None
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
        return module.classify(text)

    def test_dummy_google_key_detected_without_values(self):
        value = 'AIza' + 'z' * 35
        result = self.scan(value)
        self.assertEqual(result, {'google_api_key': 1})
        self.assertNotIn(value, json.dumps(result))

    def test_jwt_roles_are_distinguished(self):
        import base64
        def jwt(role):
            enc = lambda obj: base64.urlsafe_b64encode(json.dumps(obj).encode()).decode().rstrip('=')
            return enc({'alg': 'HS256'}) + '.' + enc({'role': role}) + '.' + 'z' * 40
        self.assertEqual(self.scan(jwt('anon')), {'supabase_public_anon_jwt': 1})
        self.assertEqual(self.scan(jwt('service_role')), {'supabase_service_role_jwt': 1})

    def test_private_key_and_unprefixed_server_key_detected(self):
        result = self.scan('-----BEGIN ' + 'PRIVATE KEY-----\nCOHERE_API_KEY=' + 'z' * 40)
        self.assertEqual(result, {'private_key': 1, 'generic_credential_assignment': 1})

    def test_unquoted_javascript_property_is_not_a_secret(self):
        self.assertEqual(self.scan('access_token:client.auth.accessTokenValue,'), {})

    def test_placeholder_is_not_a_credential(self):
        self.assertEqual(self.scan('COHERE_API_KEY=your_cohere_api_key\nSUPABASE_ANON_KEY=<your-key>'), {})


if __name__ == '__main__':
    unittest.main()
