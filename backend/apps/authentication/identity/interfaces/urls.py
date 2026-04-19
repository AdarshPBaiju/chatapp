from django.urls import path
from authentication.identity.interfaces.views import (
    IdentityInitAPIView,
    IdentityChallengeAPIView,
    ClientLoginAPIView,
    ClientTokenVerifyAPIView,
    ClientTokenRefreshAPIView,
)

urlpatterns = [
    path("init/", IdentityInitAPIView.as_view(), name="identity-init"),
    path("challenge/", IdentityChallengeAPIView.as_view(), name="identity-challenge"),
    path("login/", ClientLoginAPIView.as_view(), name="login"),
    path("token/verify/", ClientTokenVerifyAPIView.as_view(), name="token-verify"),
    path("token/refresh/", ClientTokenRefreshAPIView.as_view(), name="token-refresh"),
]
