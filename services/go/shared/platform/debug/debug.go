package debug

import (
	"fmt"
	"strings"
	"time"
)

const (
	colorMagenta = "\033[95m"
	colorRed     = "\033[91m"
	colorYellow  = "\033[93m"
	colorGreen   = "\033[92m"
	colorOrange  = "\033[33m"
	colorCyan    = "\033[96m"
	colorBlue    = "\033[94m"
	colorGray    = "\033[90m"
	bold         = "\033[1m"
	reset        = "\033[0m"
)

var colorMap = map[string]string{
	"GO-AUTH": colorMagenta,
	"RISK":    colorRed,
	"ENRICH":  colorYellow,
	"SUCCESS": colorGreen,
	"FALLBACK": colorOrange,
	"SYSTEM":  colorCyan,
	"CELERY":  colorBlue,
	"GO-CHAT": colorCyan,
}

// Print diagnostic messages with ANSI colors and timestamps, matching the Python debug_print style.
func Print(prefix, message string) {
	color, ok := colorMap[strings.ToUpper(prefix)]
	if !ok {
		color = colorCyan
	}

	timestamp := time.Now().Format("15:04:05.000")
	icon := "🔌"

	fmt.Printf("%s[%s]%s %s%s%s %-10s:%s %s\n",
		colorGray, timestamp, reset,
		color, bold, icon, prefix, reset,
		message,
	)
}
