from django.db import migrations


def backfill_direct_room_slugs(apps, schema_editor):
    Room = apps.get_model("chat", "Room")
    RoomMembership = apps.get_model("chat", "RoomMembership")

    direct_rooms = Room.objects.filter(type="DIRECT", is_deleted=False).order_by("created_at")
    claimed_slugs = set(Room.objects.exclude(slug__isnull=True).values_list("slug", flat=True))

    for room in direct_rooms:
        memberships = list(
            RoomMembership.objects.filter(room=room, is_active=True)
            .order_by("client_id")
            .values_list("client_id", flat=True)
        )
        if len(memberships) != 2:
            continue

        left, right = sorted(str(client_id) for client_id in memberships)
        slug = f"dm:{left}:{right}"
        if room.slug == slug:
            claimed_slugs.add(slug)
            continue
        if slug in claimed_slugs:
            continue

        room.slug = slug
        room.save(update_fields=["slug"])
        claimed_slugs.add(slug)


class Migration(migrations.Migration):
    dependencies = [
        ("chat", "0007_room_slug_alter_message_idempotency_key_and_more"),
    ]

    operations = [
        migrations.RunPython(backfill_direct_room_slugs, migrations.RunPython.noop),
    ]
