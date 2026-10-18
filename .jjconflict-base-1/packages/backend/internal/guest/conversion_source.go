package guest

import (
	"strconv"
	"strings"
	"unicode/utf8"
)

// importsEffect recognizes static module imports after lexical removal of
// comments, strings and templates. Quoted examples and comments cost nothing.
func importsEffect(source string) bool {
	type token struct {
		text   string
		quoted bool
	}
	var tokens []token
	for i := 0; i < len(source); {
		c := source[i]
		if strings.HasPrefix(source[i:], "//") {
			end := strings.IndexByte(source[i:], '\n')
			if end < 0 {
				break
			}
			i += end + 1
			continue
		}
		if strings.HasPrefix(source[i:], "/*") {
			end := strings.Index(source[i+2:], "*/")
			if end < 0 {
				return false
			}
			i += end + 4
			continue
		}
		if c == '/' {
			// Regex literals may contain import-shaped examples too.
			end := i + 1
			bracket := false
			for end < len(source) && source[end] != '\n' {
				if source[end] == '\\' {
					end += 2
					continue
				}
				if source[end] == '[' {
					bracket = true
				}
				if source[end] == ']' {
					bracket = false
				}
				if source[end] == '/' && !bracket {
					break
				}
				end++
			}
			if end < len(source) && source[end] == '/' {
				i = end + 1
				tokens = append(tokens, token{"", true})
				continue
			}
		}
		if c == '\'' || c == '"' || c == '`' {
			quote := c
			i++
			start := i
			escaped := false
			for i < len(source) && source[i] != quote {
				if source[i] == '\\' {
					escaped = true
					i++
				}
				i++
			}
			if i >= len(source) {
				return false
			}
			value := source[start:i]
			i++
			if quote == '`' || escaped {
				value = ""
			}
			tokens = append(tokens, token{value, true})
			continue
		}
		if c >= 'a' && c <= 'z' || c >= 'A' && c <= 'Z' || c == '_' || c == '$' {
			start := i
			i++
			for i < len(source) && (source[i] >= 'a' && source[i] <= 'z' || source[i] >= 'A' && source[i] <= 'Z' || source[i] >= '0' && source[i] <= '9' || source[i] == '_' || source[i] == '$') {
				i++
			}
			tokens = append(tokens, token{source[start:i], false})
			continue
		}
		if c > ' ' {
			tokens = append(tokens, token{string(c), false})
		}
		i++
	}
	for i, t := range tokens {
		if t.quoted || t.text != "import" || i+1 >= len(tokens) || (i > 0 && tokens[i-1].text == ".") {
			continue
		}
		next := tokens[i+1]
		if next.quoted {
			if next.text == "effect" {
				return true
			}
			continue
		}
		if next.text == "(" || next.text == "." || next.text == ":" {
			continue
		}
		for j := i + 1; j+1 < len(tokens); j++ {
			if tokens[j].text == ";" || tokens[j].text == "import" {
				break
			}
			if !tokens[j].quoted && tokens[j].text == "from" && tokens[j+1].quoted && tokens[j+1].text == "effect" {
				return true
			}
		}
	}
	return false
}

// JSON decoders replace malformed UTF-8 and lone UTF-16 escapes. Refuse those
// bytes before decoding, rather than silently converting a different file.
func validSourceJSON(raw []byte) bool {
	if !utf8.Valid(raw) {
		return false
	}
	for i := 0; i < len(raw); i++ {
		if raw[i] != '\\' {
			continue
		}
		i++
		if i >= len(raw) {
			return false
		}
		if raw[i] != 'u' {
			continue
		}
		if i+4 >= len(raw) {
			return false
		}
		value, err := strconv.ParseUint(string(raw[i+1:i+5]), 16, 16)
		if err != nil {
			return false
		}
		i += 4
		if value >= 0xdc00 && value <= 0xdfff {
			return false
		}
		if value >= 0xd800 && value <= 0xdbff {
			if i+6 >= len(raw) || raw[i+1] != '\\' || raw[i+2] != 'u' {
				return false
			}
			low, err := strconv.ParseUint(string(raw[i+3:i+7]), 16, 16)
			if err != nil || low < 0xdc00 || low > 0xdfff {
				return false
			}
			i += 6
		}
	}
	return true
}
