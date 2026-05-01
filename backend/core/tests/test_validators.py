from django.test import TestCase
from core.validators import (
    RequiredRule,
    EmailFormatRule,
    MinMaxLengthRule,
    ServiceValidator,
)
from rest_framework.serializers import ValidationError


class ValidatorTests(TestCase):
    def test_required_rule(self):
        rule = RequiredRule()
        # Should pass
        self.assertIsNone(rule.validate("value", {}))
        # Should fail
        self.assertIsNotNone(rule.validate(None, {}))
        self.assertIsNotNone(rule.validate("", {}))

    def test_email_format_rule(self):
        rule = EmailFormatRule()
        # Should pass
        self.assertIsNone(rule.validate("test@example.com", {}))
        # Should fail
        self.assertIsNotNone(rule.validate("invalid-email", {}))

    def test_min_max_length_rule(self):
        rule = MinMaxLengthRule(min_len=3, max_len=5)
        # Should pass
        self.assertIsNone(rule.validate("abc", {}))
        self.assertIsNone(rule.validate("abcde", {}))
        # Should fail min
        self.assertIsNotNone(rule.validate("ab", {}))
        # Should fail max
        self.assertIsNotNone(rule.validate("abcdef", {}))

    def test_service_validator_engine(self):
        validator = ServiceValidator()
        schema = {
            "name": [RequiredRule(), MinMaxLengthRule(min_len=2)],
            "email": [EmailFormatRule()],
        }

        # Valid data
        data = {"name": "JD", "email": "jd@example.com"}
        validator.run(data, schema)  # Should not raise

        # Invalid data
        data = {"name": "J", "email": "bad-email"}
        with self.assertRaises(ValidationError) as cm:
            validator.run(data, schema)

        self.assertIn("name", cm.exception.detail)
        self.assertIn("email", cm.exception.detail)
