from django.db import transaction
from chat.models import Room, RoomMembership
from users.models import Client


class ChatService:
    @staticmethod
    def get_or_create_dm_room(client_a: Client, client_b: Client) -> Room:
        """
        Retrieves an existing DM room between two clients or creates a new one.
        """
        if client_a == client_b:
            raise ValueError("Cannot create a DM room with yourself.")

        # Deterministic DM key
        ids = sorted([str(client_a.id), str(client_b.id)])
        dm_slug = f"dm:{ids[0]}:{ids[1]}"

        # Check for existing DM room via slug
        existing_room = Room.objects.filter(slug=dm_slug, is_deleted=False).first()

        if existing_room:
            return existing_room

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
        if room.type == Room.RoomType.DIRECT:
            other_member = (
                Client.objects.filter(
                    chat_memberships__room=room, chat_memberships__is_active=True
                )
                .exclude(id=viewer_client.id)
                .first()
            )

            if other_member:
                # Use nickname if set in contacts
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
                }

        return {"name": room.name, "avatar": room.avatar.url if room.avatar else None}
