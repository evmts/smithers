---
"@smthrs/model": patch
---

Clamp the proxy metering guide's output budget to an integer from zero through 1,000 (defaulting unset or nonfinite values to 1,000), and forward the same cap to the model so its reservation bounds output. Uses the library catalog's ModelProxy serving and metering entry.
