package types

type VerifyRequest struct {
	Token          string         `json:"token"`
	ExpectedType   string         `json:"expected_type,omitempty"`
	CheckSession   bool           `json:"check_session"`
	GracePeriodSec int64          `json:"grace_period_sec"`
	RequestContext RequestContext `json:"request_context"`
}

type RequestContext struct {
	IPAddress      string `json:"ip_address"`
	UserAgent      string `json:"user_agent"`
	AcceptLanguage string `json:"accept_language"`
	TimezoneOffset string `json:"timezone_offset"`
	DeviceEntropy  string `json:"device_entropy"`
	Fingerprint    string `json:"fingerprint"`
}

type VerifyResponseData struct {
	Payload   map[string]any `json:"payload"`
	RiskScore int            `json:"risk_score"`
	Location  *Location      `json:"location,omitempty"`
}

type Location struct {
	City        string  `json:"city"`
	CountryCode string  `json:"country_code"`
	Latitude    float64 `json:"latitude"`
	Longitude   float64 `json:"longitude"`
}
