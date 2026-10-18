package config

// GuestConfig is shared by hosted and single-owner installations. An empty
// allowlist disables guest compute. Monetary limits are integer nanodollars.
type GuestConfig struct {
	Repositories  []string `mapstructure:"repositories"`
	Provider      string   `mapstructure:"provider"`
	Model         string   `mapstructure:"model"`
	SponsorID     int64    `mapstructure:"sponsor_id"`
	IPSecret      string   `mapstructure:"ip_secret"`
	Disabled      bool     `mapstructure:"disabled"`
	RequestNanos  int64    `mapstructure:"request_nanos"`
	DailyNanos    int64    `mapstructure:"daily_nanos"`
	WindowNanos   int64    `mapstructure:"window_nanos"`
	WindowStart   string   `mapstructure:"window_start"`
	WindowEnd     string   `mapstructure:"window_end"`
	RequestsPerIP int      `mapstructure:"requests_per_ip"`
	OutputTokens  int      `mapstructure:"output_tokens"`
}
