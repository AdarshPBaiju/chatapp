package auth

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"time"

	"chatapp/services/go/shared/platform/httpx"
)

type VerifierClient struct {
	baseURL        string
	internalSecret string
	httpClient     *http.Client
}

type VerifyResponse struct {
	httpx.APIResponse
	Data struct {
		UserID string `json:"user_id"`
	} `json:"data"`
}

func NewVerifierClient(baseURL, internalSecret string) *VerifierClient {
	return &VerifierClient{
		baseURL:        baseURL,
		internalSecret: internalSecret,
		httpClient: &http.Client{
			Timeout: 2 * time.Second,
		},
	}
}

func (c *VerifierClient) VerifyToken(ctx context.Context, token string) (string, error) {
	payload, _ := json.Marshal(map[string]string{
		"token":         token,
		"expected_type": "access",
	})

	req, err := http.NewRequestWithContext(ctx, "POST", c.baseURL+"/api/v1/verify", bytes.NewBuffer(payload))
	if err != nil {
		return "", err
	}

	req.Header.Set("X-Internal-Service-Secret", c.internalSecret)
	req.Header.Set("Content-Type", "application/json")

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()

	var apiResp VerifyResponse
	if err := json.NewDecoder(resp.Body).Decode(&apiResp); err != nil {
		return "", err
	}

	if apiResp.Status != "ok" {
		return "", fmt.Errorf("auth failed: %s", apiResp.Message)
	}

	return apiResp.Data.UserID, nil
}
