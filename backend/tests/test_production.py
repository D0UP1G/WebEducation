from django.test import SimpleTestCase

from config.production import validate_public_environment


class PublicEnvironmentTest(SimpleTestCase):
    def setUp(self):
        self.env = {
            "DJANGO_SECRET_KEY": "g1V7p4N9q2L8x5Y3c6K0m8R4t1B7w9H2f5J6d3S0a8P4z7Q1u6",
            "DJANGO_DEBUG": "0",
            "DJANGO_SECURE_COOKIES": "1",
            "DJANGO_ALLOWED_HOSTS": "school.acme-school.ru",
            "DJANGO_CSRF_TRUSTED_ORIGINS": "https://school.acme-school.ru",
            "DATABASE_URL": "postgresql://webeducation:secure-pass@db:5432/webeducation",
            "POSTGRES_PASSWORD": "secure-pass",
        }

    def test_accepts_explicit_non_default_public_configuration(self):
        self.assertEqual(validate_public_environment(self.env), [])

    def test_rejects_example_secrets_and_local_http_origins(self):
        self.env.update(DJANGO_SECRET_KEY="change-me-for-local-development", POSTGRES_PASSWORD="webeducation",
                        DATABASE_URL="postgresql://webeducation:webeducation@db:5432/webeducation",
                        DJANGO_ALLOWED_HOSTS="localhost", DJANGO_CSRF_TRUSTED_ORIGINS="http://localhost")
        self.assertGreaterEqual(len(validate_public_environment(self.env)), 3)

    def test_rejects_mismatched_database_password_and_debug(self):
        self.env.update(DJANGO_DEBUG="1", POSTGRES_PASSWORD="different")
        self.assertGreaterEqual(len(validate_public_environment(self.env)), 2)
