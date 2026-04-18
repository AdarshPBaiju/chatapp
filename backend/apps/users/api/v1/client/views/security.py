import pyotp
import secrets
import string
from rest_framework import views, permissions, status
from core.api.responses import ResponseFactory
from users.api.v1.client.serializers.security import TwoFactorVerifySerializer, TwoFactorRecoverySerializer

class TwoFactorSetupAPIView(views.APIView):
    """
    Step 1: Generate a TOTP secret and return the provisioning URI.
    Does NOT enable 2FA yet.
    """
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request):
        client = request.user.client
        if client.is_two_factor_enabled:
            return ResponseFactory.error(
                message="2FA is already enabled for this account.",
                code=status.HTTP_400_BAD_REQUEST
            )

        # Generate new secret if doesn't exist or refreshing
        if not client.totp_secret:
            client.totp_secret = pyotp.random_base32()
            client.save()

        totp = pyotp.TOTP(client.totp_secret)
        provisioning_uri = totp.provisioning_uri(
            name=request.user.email,
            issuer_name="ChitChat"
        )

        return ResponseFactory.success(
            message="2FA setup initiated.",
            data={
                "secret": client.totp_secret,
                "provisioning_uri": provisioning_uri
            }
        )

class TwoFactorVerifyAPIView(views.APIView):
    """
    Step 2: Verify the 6-digit code.
    Enables 2FA and returns backup codes.
    """
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request):
        serializer = TwoFactorVerifySerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        client = request.user.client
        code = serializer.validated_data["code"]

        totp = pyotp.TOTP(client.totp_secret)
        if not totp.verify(code):
            return ResponseFactory.error(
                message="Invalid verification code.",
                code=status.HTTP_400_BAD_REQUEST
            )

        # Success: Enable 2FA
        client.is_two_factor_enabled = True
        
        # Generate 10 Backup Codes
        backup_codes = []
        for _ in range(10):
            code = ''.join(secrets.choice(string.digits) for _ in range(8))
            backup_codes.append(code)
        
        client.backup_codes = backup_codes
        client.save()

        return ResponseFactory.success(
            message="2FA successfully enabled.",
            data={
                "backup_codes": backup_codes
            }
        )

class TwoFactorBackupCodesAPIView(views.APIView):
    """
    View or regenerate backup codes. Requires password re-auth.
    """
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request):
        serializer = TwoFactorRecoverySerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        if not request.user.check_password(serializer.validated_data["password"]):
            return ResponseFactory.error(
                message="Incorrect password verification.",
                code=status.HTTP_401_UNAUTHORIZED
            )

        client = request.user.client
        # Generate new ones if explicitly requested (regeneration logic could be a separate flag)
        # For now, just show existing or generate if empty
        if not client.backup_codes:
            backup_codes = [''.join(secrets.choice(string.digits) for _ in range(8)) for _ in range(10)]
            client.backup_codes = backup_codes
            client.save()

        return ResponseFactory.success(
            message="Backup codes retrieved.",
            data={"backup_codes": client.backup_codes}
        )
