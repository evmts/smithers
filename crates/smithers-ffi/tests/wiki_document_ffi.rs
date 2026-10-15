//! Malformed wiki updates must be rejected through the public C ABI.
use base64::prelude::{Engine as _, BASE64_STANDARD};
use serde_json::{json, Value};
use std::ffi::{CStr, CString};

fn request(value: Value) -> Value {
    let input = CString::new(value.to_string()).unwrap();
    let output = smithers_ffi::smithers_wiki_document(input.as_ptr());
    assert!(!output.is_null());
    // The ABI returns an owned NUL-terminated string; copy it before freeing.
    let bytes = unsafe { CStr::from_ptr(output) }.to_bytes().to_owned();
    unsafe { smithers_ffi::smithers_free_string(output) };
    serde_json::from_slice(&bytes).unwrap()
}

#[test]
fn wiki_rejects_trailing_bytes_in_state_and_update() {
    let seed = request(json!({"operation": "seed", "markdown": "Keep 🦀"}));
    let state = seed["state"].as_str().unwrap();
    let mut malformed = BASE64_STANDARD.decode(state).unwrap();
    malformed.push(0);
    let malformed = BASE64_STANDARD.encode(malformed);
    for value in [
        json!({"operation": "apply", "state": state, "update": malformed}),
        json!({"operation": "apply", "state": malformed, "update": "AAA="}),
        json!({"operation": "replace", "state": malformed, "markdown": "Replacement"}),
    ] {
        let result = request(value);
        assert_eq!(result["code"], "invalid_argument", "{result}");
        assert_eq!(result["error"], "invalid Yjs v1 wiki document update");
    }
    let unchanged = request(json!({"operation": "apply", "state": state, "update": "AAA="}));
    assert_eq!(unchanged["markdown"], "Keep 🦀");
}

#[test]
fn wiki_rejects_malformed_frames_then_accepts_a_valid_request() {
    let seed = request(json!({"operation": "seed", "markdown": "Original"}));
    let state = seed["state"].as_str().unwrap();
    for bytes in [
        vec![],          // Missing both update sections.
        vec![0],         // Missing delete set.
        vec![128, 0, 0], // Noncanonical zero client count.
        vec![0, 128, 0], // Noncanonical zero delete count.
        vec![1, 1, 11],  // Truncated client clock and content.
        // Client 2^32 + 11 must not wrap to client 11.
        vec![
            1, 1, 139, 128, 128, 128, 16, 0, 4, 1, 8, b'm', b'a', b'r', b'k', b'd', b'o', b'w',
            b'n', 1, b'x', 0,
        ],
    ] {
        let result = request(json!({
            "operation": "apply", "state": state, "update": BASE64_STANDARD.encode(bytes)
        }));
        assert_eq!(result["code"], "invalid_argument", "{result}");
        assert_eq!(result["error"], "invalid Yjs v1 wiki document update");
        // Malformed requests must not poison subsequent calls to the C ABI.
        let recovered = request(json!({
            "operation": "replace", "state": state, "markdown": "Recovered 🦀"
        }));
        assert_eq!(recovered["markdown"], "Recovered 🦀");
    }
}
