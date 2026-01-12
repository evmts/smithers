use futures_util::{SinkExt, StreamExt};
use serde_json::Value;
use std::net::SocketAddr;
use tauri::{AppHandle, Emitter};
use tokio::net::TcpListener;
use tokio_tungstenite::accept_async;

const WS_PORT: u16 = 9876;

pub async fn start_server(app_handle: AppHandle) {
    let addr = format!("127.0.0.1:{}", WS_PORT);

    let listener = match TcpListener::bind(&addr).await {
        Ok(l) => l,
        Err(e) => {
            eprintln!("Failed to bind WebSocket server to {}: {}", addr, e);
            return;
        }
    };

    println!("Smithers WebSocket server listening on ws://{}", addr);

    while let Ok((stream, addr)) = listener.accept().await {
        let app = app_handle.clone();
        tokio::spawn(handle_connection(stream, addr, app));
    }
}

async fn handle_connection(
    stream: tokio::net::TcpStream,
    addr: SocketAddr,
    app_handle: AppHandle,
) {
    let ws_stream = match accept_async(stream).await {
        Ok(ws) => ws,
        Err(e) => {
            eprintln!("WebSocket handshake failed for {}: {}", addr, e);
            return;
        }
    };

    println!("New WebSocket connection from {}", addr);

    let (mut write, mut read) = ws_stream.split();

    // Send connected message
    let connected_msg = serde_json::json!({
        "type": "connected",
        "serverVersion": env!("CARGO_PKG_VERSION"),
        "timestamp": chrono::Utc::now().timestamp_millis()
    });

    if let Err(e) = write
        .send(tokio_tungstenite::tungstenite::Message::Text(
            connected_msg.to_string(),
        ))
        .await
    {
        eprintln!("Failed to send connected message: {}", e);
        return;
    }

    // Handle incoming messages from CLI
    while let Some(msg) = read.next().await {
        match msg {
            Ok(tokio_tungstenite::tungstenite::Message::Text(text)) => {
                // Parse JSON message
                match serde_json::from_str::<Value>(&text) {
                    Ok(json) => {
                        // Forward message to frontend via Tauri event
                        if let Some(msg_type) = json.get("type").and_then(|t| t.as_str()) {
                            let event_name = format!("ws:{}", msg_type);
                            if let Err(e) = app_handle.emit(&event_name, json.clone()) {
                                eprintln!("Failed to emit event {}: {}", event_name, e);
                            }

                            // Also emit to a general channel
                            if let Err(e) = app_handle.emit("ws:message", json) {
                                eprintln!("Failed to emit ws:message event: {}", e);
                            }
                        }
                    }
                    Err(e) => {
                        eprintln!("Failed to parse WebSocket message: {}", e);
                    }
                }
            }
            Ok(tokio_tungstenite::tungstenite::Message::Close(_)) => {
                println!("WebSocket connection closed by {}", addr);
                break;
            }
            Err(e) => {
                eprintln!("WebSocket error from {}: {}", addr, e);
                break;
            }
            _ => {}
        }
    }

    println!("WebSocket connection ended for {}", addr);
}
