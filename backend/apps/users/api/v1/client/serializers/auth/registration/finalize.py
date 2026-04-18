from __future__ import annotations
from rest_framework import serializers
from core.validators import v, auto_configure_fields


@auto_configure_fields
class ClientSignUpFinalizeSerializer(serializers.Serializer):
    signup_token = v.string().label("Signup Token")
    full_name = v.string().max(255).label("Full Name")
    password = v.password().min(8).label("Password")
    confirm_password = v.confirm_password(target="password")
