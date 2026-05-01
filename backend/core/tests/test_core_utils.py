from django.test import TestCase
from django.db import models
from rest_framework import serializers
from core.api.serializers import FKResolverMixin
from core.utils import SmartUploadPath, UploadPathConfig
from users.models import CustomUser
import uuid


class MockModel(models.Model):
    name = models.CharField(max_length=100)
    user = models.ForeignKey(CustomUser, on_delete=models.CASCADE, null=True)

    class Meta:
        app_label = "core"


class MockSerializer(FKResolverMixin, serializers.Serializer):
    user_id = serializers.UUIDField(required=False)

    fk_field_mappings = {"user": CustomUser}
    fk_field_sources = {"user": "user_id"}


class CoreUtilsTests(TestCase):
    def setUp(self):
        self.user = CustomUser.objects.create_user(
            email="utils@example.com", password="password123"
        )

    def test_fk_resolver_mixin_success(self):
        serializer = MockSerializer()
        data = {"user_id": str(self.user.id)}
        resolved = serializer.resolve_foreign_keys(data)
        self.assertEqual(resolved["user_id"], self.user)

    def test_fk_resolver_mixin_not_found(self):
        serializer = MockSerializer()
        random_id = str(uuid.uuid4())
        data = {"user_id": random_id}
        with self.assertRaises(serializers.ValidationError) as cm:
            serializer.resolve_foreign_keys(data)
        self.assertIn("user", cm.exception.detail)

    def test_fk_resolver_cache_hit(self):
        serializer = MockSerializer()
        data = {"user_id": str(self.user.id)}

        # First call hits DB
        with self.assertNumQueries(1):
            serializer.resolve_foreign_keys(data)

        # Second call hits cache
        with self.assertNumQueries(0):
            serializer.resolve_foreign_keys(data)

    def test_smart_upload_path_prepend_uuid(self):
        config = UploadPathConfig(
            base_path="test", field_lookup="id", filename_mode="prepend_uuid"
        )
        sup = SmartUploadPath(config)
        instance = type("Obj", (), {"id": "123"})()
        path = sup(instance, "image.png")
        self.assertTrue(path.startswith("test/123/"))
        self.assertTrue(path.endswith("_image.png"))
        self.assertIn("-", path)  # UUID part

    def test_smart_upload_path_keep_original(self):
        config = UploadPathConfig(
            base_path="test", field_lookup="id", filename_mode="keep_original"
        )
        sup = SmartUploadPath(config)
        instance = type("Obj", (), {"id": "123"})()
        path = sup(instance, "image.png")
        self.assertEqual(path, "test/123/image.png")
