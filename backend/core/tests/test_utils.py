from django.test import TestCase
from core.utils.files import SmartUploadPath, UploadPathConfig
from django.utils import timezone
from unittest.mock import MagicMock


class FileUtilsTests(TestCase):
    def test_smart_upload_path_basic(self):
        config = UploadPathConfig(base_path="avatars", field_lookup="id")
        generator = SmartUploadPath(config)
        instance = MagicMock()
        instance.id = 123

        path = generator(instance, "test.jpg")
        self.assertTrue(path.startswith("avatars/123/"))
        self.assertTrue(path.endswith("test.jpg"))

    def test_smart_upload_path_uuid_mode(self):
        config = UploadPathConfig(base_path="files", filename_mode="uuid")
        generator = SmartUploadPath(config)
        instance = MagicMock()
        instance.pk = "abc"

        path = generator(instance, "my_file.PDF")
        self.assertTrue(path.endswith(".pdf"))
        filename = path.split("/")[-1]
        self.assertEqual(len(filename), 36 + 4)

    def test_smart_upload_path_with_date(self):
        config = UploadPathConfig(base_path="logs", use_date_structure=True)
        generator = SmartUploadPath(config)
        instance = MagicMock()
        instance.pk = "system"

        path = generator(instance, "log.txt")
        now = timezone.now()
        date_str = now.strftime("%Y/%m/%d")
        self.assertIn(date_str, path)

    def test_smart_upload_path_template(self):
        config = UploadPathConfig(path_template="user_{user.id}/{year}/{filename}")
        generator = SmartUploadPath(config)
        instance = MagicMock()
        instance.user.id = 456

        path = generator(instance, "photo.png")
        self.assertTrue(path.startswith("user_456/"))
        self.assertIn(str(timezone.now().year), path)
        self.assertTrue(path.endswith("photo.png"))

    def test_resolve_lookup_invalid(self):
        config = UploadPathConfig(field_lookup="non_existent.attr")
        generator = SmartUploadPath(config)
        instance = MagicMock()
        del instance.non_existent

        path = generator(instance, "file.txt")
        self.assertIn("unknown", path)

    def test_prepend_uuid_mode(self):
        config = UploadPathConfig(filename_mode="prepend_uuid")
        generator = SmartUploadPath(config)
        instance = MagicMock()
        instance.pk = 1

        path = generator(instance, "Cool Image!.jpg")
        filename = path.split("/")[-1]
        self.assertIn("_cool-image.jpg", filename)
        self.assertEqual(len(filename.split("_")[0]), 8)
