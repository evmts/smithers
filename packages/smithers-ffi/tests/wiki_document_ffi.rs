//! Malformed wiki updates must be rejected through the public C ABI.
use base64::prelude::{Engine as _, BASE64_STANDARD};
use serde_json::{json, Value};
use std::ffi::{CStr, CString};
use yrs::{Any, Doc, Map, ReadTxn, StateVector, Transact};

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

#[test]
fn wiki_accepts_maximum_client_id_and_rejects_every_truncated_frame() {
    // A complete Yjs text insertion with client u32::MAX and clock zero.
    // Keep the wire fixture independent of the implementation's encoder.
    let update = vec![
        1, 1, 255, 255, 255, 255, 15, 0, 4, 1, 8, b'm', b'a', b'r', b'k', b'd', b'o', b'w', b'n',
        4, 240, 159, 166, 128, 0,
    ];
    let valid = request(json!({
        "operation": "apply", "state": "AAA=", "update": BASE64_STANDARD.encode(&update)
    }));
    assert_eq!(valid["markdown"], "🦀", "{valid}");
    // Serialization must preserve the client identity and Unicode text.
    let replay = request(json!({
        "operation": "apply", "state": valid["state"], "update": BASE64_STANDARD.encode(&update)
    }));
    assert_eq!(replay["markdown"], "🦀", "{replay}");
    for end in 0..update.len() {
        let result = request(json!({
            "operation": "apply", "state": "AAA=", "update": BASE64_STANDARD.encode(&update[..end])
        }));
        assert_eq!(result["code"], "invalid_argument", "prefix {end}: {result}");
    }
}

#[test]
fn wiki_rejects_invalid_utf8_without_replacing_existing_text() {
    let seed = request(json!({"operation": "seed", "markdown": "Keep 🦀"}));
    for payload in [
        vec![255],
        vec![192, 128],
        vec![237, 160, 128],
        vec![240, 159, 166],
    ] {
        let mut update = vec![
            1,
            1,
            11,
            0,
            4,
            1,
            8,
            b'm',
            b'a',
            b'r',
            b'k',
            b'd',
            b'o',
            b'w',
            b'n',
            payload.len() as u8,
        ];
        update.extend_from_slice(&payload);
        update.push(0);
        for field in ["state", "update"] {
            let mut input = json!({"operation": "apply", "state": seed["state"], "update": "AAA="});
            input[field] = json!(BASE64_STANDARD.encode(&update));
            let result = request(input);
            assert_eq!(result["code"], "invalid_argument", "{field}: {result}");
        }
    }
    let recovered =
        request(json!({"operation": "apply", "state": seed["state"], "update": "AAA="}));
    assert_eq!(recovered["markdown"], "Keep 🦀");
}

#[test]
fn wiki_enforces_nested_value_budget_and_retains_accepted_values() {
    for depth in [0, 1, 63, 64, 65, 100] {
        let doc = Doc::with_client_id(17);
        let authors = doc.get_or_insert_map("authors");
        let mut value = Any::Null;
        for _ in 0..depth {
            value = Any::Array(vec![value].into());
        }
        authors.insert(&mut doc.transact_mut(), "nested", value.clone());
        let update = doc
            .transact()
            .encode_state_as_update_v1(&StateVector::default());
        let result = request(json!({
            "operation": "apply", "state": "AAA=", "update": BASE64_STANDARD.encode(update)
        }));
        if depth > 64 {
            assert_eq!(
                result["code"], "invalid_argument",
                "depth {depth}: {result}"
            );
        } else {
            assert_eq!(result["markdown"], "", "depth {depth}: {result}");
            // Verify accepted nested data survives serialization, beyond the
            // Markdown field returned by the ABI.
            let restored = Doc::new();
            let bytes = BASE64_STANDARD
                .decode(result["state"].as_str().unwrap())
                .unwrap();
            use yrs::updates::decoder::Decode;
            restored
                .transact_mut()
                .apply_update(yrs::Update::decode_v1(&bytes).unwrap())
                .unwrap();
            assert_eq!(
                restored
                    .get_or_insert_map("authors")
                    .get(&restored.transact(), "nested"),
                Some(yrs::Out::Any(value))
            );
        }
    }
}

#[test]
fn wiki_rejects_oversized_counts_before_allocating() {
    for bytes in [
        vec![255, 255, 255, 255, 15],    // Number of client blocks.
        vec![1, 255, 255, 255, 255, 15], // Number of structs in one block.
        vec![0, 255, 255, 255, 255, 15], // Number of delete-set clients.
    ] {
        let result = request(json!({
            "operation": "apply", "state": "AAA=", "update": BASE64_STANDARD.encode(bytes)
        }));
        assert_eq!(result["code"], "invalid_argument", "{result}");
    }
    let recovered = request(json!({"operation": "seed", "markdown": "Still usable"}));
    assert_eq!(recovered["markdown"], "Still usable");
}

#[test]
fn wiki_markdown_limit_counts_utf8_bytes_and_rejects_merged_overflow() {
    const LIMIT: usize = 1 << 20;
    let markdown = "🦀".repeat(LIMIT / 4);
    let seed = request(json!({"operation": "seed", "markdown": markdown}));
    assert_eq!(seed["markdown"], markdown);
    let state = seed["state"].as_str().unwrap();
    let replaced = request(json!({"operation": "replace", "state": state, "markdown": markdown}));
    assert_eq!(replaced["markdown"], markdown);
    for operation in ["seed", "replace"] {
        let mut input = json!({"operation": operation, "markdown": format!("{markdown}x")});
        if operation == "replace" {
            input["state"] = json!(state);
        }
        let result = request(input);
        assert_eq!(result["code"], "invalid_argument", "{operation}: {result}");
        assert_eq!(result["error"], "wiki Markdown exceeds 1 MiB");
    }
    // Each insertion is small and valid on its own, but the merged text crosses
    // the Markdown limit. Use a real independent editor to encode the delta.
    use yrs::{updates::decoder::Decode, Text};
    let editor = Doc::with_client_id(29);
    editor
        .transact_mut()
        .apply_update(yrs::Update::decode_v1(&BASE64_STANDARD.decode(state).unwrap()).unwrap())
        .unwrap();
    let text = editor.get_or_insert_text("markdown");
    let update = {
        let mut txn = editor.transact_mut();
        text.insert(&mut txn, 0, "x");
        txn.encode_update_v1()
    };
    let overflow = request(json!({
        "operation": "apply", "state": state, "update": BASE64_STANDARD.encode(update)
    }));
    assert_eq!(overflow["code"], "invalid_argument");
    assert_eq!(overflow["error"], "merged wiki Markdown exceeds 1 MiB");
    let recovered = request(json!({"operation": "apply", "state": state, "update": "AAA="}));
    assert_eq!(recovered["markdown"], markdown);
}

#[test]
fn wiki_rejects_unknown_fields_missing_fields_and_wrong_types() {
    for input in [
        json!({"operation": "seed", "markdown": "ok", "state": "AAA="}),
        json!({"operation": "apply", "state": "AAA=", "update": "AAA=", "markdown": "ignored?"}),
        json!({"operation": "replace", "state": "AAA=", "markdown": "ok", "update": "AAA="}),
        json!({"operation": "seed"}),
        json!({"operation": "apply", "state": "AAA="}),
        json!({"operation": "replace", "markdown": "ok"}),
        json!({"operation": "seed", "markdown": null}),
        json!({"operation": "apply", "state": [], "update": "AAA="}),
        json!({"operation": "replace", "state": "AAA=", "markdown": 7}),
        json!({"operation": "unknown"}),
        json!(null),
        json!([]),
    ] {
        let result = request(input.clone());
        assert_eq!(result["code"], "invalid_argument", "{input}: {result}");
        assert_eq!(result["error"], "invalid wiki document request");
    }
    let recovered = request(json!({"operation": "seed", "markdown": "Accepted"}));
    assert_eq!(recovered["markdown"], "Accepted");
}

#[test]
fn wiki_bounds_nested_maps_and_preserves_accepted_values() {
    for depth in [0, 1, 63, 64, 65, 100] {
        let doc = Doc::with_client_id(31);
        let authors = doc.get_or_insert_map("authors");
        let mut value = Any::String("leaf 🦀".into());
        for _ in 0..depth {
            value = Any::Map(std::sync::Arc::new(
                [("child".to_owned(), value)].into_iter().collect(),
            ));
        }
        authors.insert(&mut doc.transact_mut(), "nested", value.clone());
        let update = doc
            .transact()
            .encode_state_as_update_v1(&StateVector::default());
        let result = request(json!({
            "operation": "apply", "state": "AAA=", "update": BASE64_STANDARD.encode(update)
        }));
        if depth > 64 {
            assert_eq!(
                result["code"], "invalid_argument",
                "depth {depth}: {result}"
            );
        } else {
            use yrs::updates::decoder::Decode;
            assert_eq!(result["markdown"], "", "depth {depth}: {result}");
            let restored = Doc::new();
            restored
                .transact_mut()
                .apply_update(
                    yrs::Update::decode_v1(
                        &BASE64_STANDARD
                            .decode(result["state"].as_str().unwrap())
                            .unwrap(),
                    )
                    .unwrap(),
                )
                .unwrap();
            assert_eq!(
                restored
                    .get_or_insert_map("authors")
                    .get(&restored.transact(), "nested"),
                Some(yrs::Out::Any(value)),
                "depth {depth}"
            );
        }
    }
    assert_eq!(
        request(json!({"operation": "seed", "markdown": "Recovered"}))["markdown"],
        "Recovered"
    );
}

#[test]
fn wiki_rejects_encoded_and_decoded_input_size_overflow() {
    for (field, limit) in [("update", 1usize << 20), ("state", 8usize << 20)] {
        // These limits leave room in their final base64 quartet: adding one
        // decoded byte does not increase the encoded length. Exercise the
        // decoded-byte check independently of the encoded-length check.
        let encoded_limit = limit.div_ceil(3) * 4;
        let oversized = BASE64_STANDARD.encode(vec![0; limit + 1]);
        assert_eq!(oversized.len(), encoded_limit);
        for encoded in [oversized, "!".repeat(encoded_limit + 1)] {
            let mut input = json!({"operation": "apply", "state": "AAA=", "update": "AAA="});
            input[field] = json!(encoded);
            let result = request(input);
            assert_eq!(result["code"], "invalid_argument", "{field}: {result}");
            assert_eq!(
                result["error"],
                "wiki document update exceeds its size limit"
            );
        }
    }
    let recovered = request(json!({"operation": "apply", "state": "AAA=", "update": "AAA="}));
    assert_eq!(recovered["markdown"], "");
}
