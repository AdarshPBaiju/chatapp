from django.db import transaction
from chat.models import Room, RoomMembership
from users.models import Client


class ChatService:
    @staticmethod
    def get_dm_slug(client_a: Client, client_b: Client) -> str:
        ids = sorted([str(client_a.id), str(client_b.id)])
        return f"dm:{ids[0]}:{ids[1]}"

    @staticmethod
    def get_or_create_dm_room(client_a: Client, client_b: Client) -> Room:
        """
        Retrieves an existing DM room between two clients or creates a new one.
        """
        if client_a == client_b:
            raise ValueError("Cannot create a DM room with yourself.")

        dm_slug = ChatService.get_dm_slug(client_a, client_b)

        # Check for existing DM room via slug
        existing_room = Room.objects.filter(slug=dm_slug, is_deleted=False).first()

        if existing_room:
            return existing_room

        legacy_room = (
            Room.objects.filter(
                type=Room.RoomType.DIRECT,
                memberships__client=client_a,
                memberships__is_active=True,
                is_deleted=False,
            )
            .filter(memberships__client=client_b, memberships__is_active=True)
            .order_by("created_at")
            .first()
        )
        if legacy_room:
            if not legacy_room.slug:
                legacy_room.slug = dm_slug
                legacy_room.save(update_fields=["slug"])
            return legacy_room

        # Create new DM room with atomic protection
        try:
            with transaction.atomic():
                room = Room.objects.create(
                    type=Room.RoomType.DIRECT,
                    slug=dm_slug,
                    name=f"DM: {client_a.username} & {client_b.username}",
                )
                RoomMembership.objects.create(room=room, client=client_a)
                RoomMembership.objects.create(room=room, client=client_b)
                return room
        except Exception:
            # Handle race condition where another thread created it just now
            return Room.objects.filter(slug=dm_slug).first()

    @staticmethod
    def get_display_context(room: Room, viewer_client: Client):
        """
        Returns display metadata (name, avatar) for a room relative to the viewer.
        """
        if room.type == Room.RoomType.DIRECT and room.slug:
            # Slug format: dm:client_a_id:client_b_id
            parts = room.slug.split(":")
            if len(parts) == 3:
                other_id = parts[2] if parts[1] == str(viewer_client.id) else parts[1]

                # Try to find the client object from prefetched participants if available
                other_member = None
                if hasattr(room, "memberships"):
                    for m in room.memberships.all():
                        if str(m.client_id) == other_id:
                            other_member = m.client
                            break

                if not other_member:
                    other_member = Client.objects.filter(id=other_id).first()

                if other_member:
                    # Check for nickname in contacts
                    from users.models.contacts import Contact

                    contact = Contact.objects.filter(
                        owner=viewer_client, contact_user=other_member
                    ).first()

                    display_name = (
                        contact.nickname
                        if contact and contact.nickname
                        else other_member.full_name
                    )

                    return {
                        "name": display_name,
                        "avatar": other_member.profile_picture.url
                        if other_member.profile_picture
                        else None,
                        "peer_client_id": other_id,
                    }

        return {
            "name": room.name,
            "avatar": room.avatar.url if room.avatar else None,
            "peer_client_id": None,
        }
