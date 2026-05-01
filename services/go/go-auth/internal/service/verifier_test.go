package service

import (
	"context"
	"testing"
	"chatapp/services/go/go-auth/internal/config"
	"chatapp/services/go/go-auth/internal/types"
)

func TestVerifier_Verify_EmptyToken(t *testing.T) {
	v := &Verifier{}
	req := types.VerifyRequest{
		Token: "",
	}
	_, err := v.Verify(context.Background(), req)
	if err == nil {
		t.Fatal("expected error for empty token, got nil")
	}

	valErr, ok := err.(*ValidationError)
	if !ok {
		t.Fatalf("expected ValidationError, got %T", err)
	}
	if valErr.ErrorCode != "AUTH_TOKEN_INVALID" {
		t.Errorf("expected AUTH_TOKEN_INVALID, got %s", valErr.ErrorCode)
	}
}
