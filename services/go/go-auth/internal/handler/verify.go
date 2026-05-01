package handler

import (
	"encoding/json"
	"errors"
	"net/http"

	"chatapp/services/go/go-auth/internal/service"
	authtypes "chatapp/services/go/go-auth/internal/types"
	"chatapp/services/go/shared/platform/httpx"
)

type VerifyHandler struct {
	verifier *service.Verifier
}

func NewVerifyHandler(verifier *service.Verifier) *VerifyHandler {
	return &VerifyHandler{verifier: verifier}
}

func (h *VerifyHandler) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	var req authtypes.VerifyRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		httpx.WriteJSON(w, http.StatusBadRequest, httpx.APIResponse{
			Status:    "error",
			Message:   "Invalid verification payload.",
			ErrorCode: "GO_AUTH_INVALID_REQUEST",
		})
		return
	}

	resp, err := h.verifier.Verify(r.Context(), req)
	if err != nil {
		var validationErr *service.ValidationError
		if errors.As(err, &validationErr) {
			httpx.WriteJSON(w, http.StatusUnauthorized, httpx.APIResponse{
				Status:    "error",
				Message:   validationErr.Message,
				ErrorCode: validationErr.ErrorCode,
			})
			return
		}

		httpx.WriteJSON(w, http.StatusInternalServerError, httpx.APIResponse{
			Status:    "error",
			Message:   "The Go authentication service is unavailable.",
			ErrorCode: "GO_AUTH_INTERNAL_ERROR",
		})
		return
	}

	httpx.WriteJSON(w, http.StatusOK, httpx.APIResponse{
		Status:  "ok",
		Message: "Token verified.",
		Data:    resp,
	})
}
